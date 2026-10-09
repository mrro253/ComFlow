-- Carrier statements, agent compensation, and approval-gated earnings.
--
-- Business model (see .cursorrules): commissions come from ACTUAL carrier
-- payments on carrier statements, not from CRM events.
--
--  - Career Agents are paid by the agency from fixed-dollar/percent rules
--    that depend on career level, product, and carrier payment category.
--    Each policy snapshots (locks) the level and rates in force when it was
--    written, so promotions and rule edits never rewrite history.
--  - Independent Agents are paid 100% by the carrier. We only store and
--    report their statements; no earnings/payout rows are ever created.
--  - Overrides (Independent Agency Owners only) are carrier-reported amounts
--    stored as ordinary transactions with commission_type = 'OVERRIDE'.
--    They are tracked, never computed.
--  - Money is integer cents (bigint). Carrier-reported amounts
--    (carrier_transactions) are kept separate from agent-earned amounts
--    (agent_earnings).
--
-- The legacy commission_plans / commission_plan_rates / commission_plan_bonuses /
-- commission_transactions tables from the CRM-driven MVP are left in place and
-- untouched. TODO: retire them once the dashboards read from the new tables.
--
-- Write model: statements, transactions, earnings, locks, and audit rows are
-- written only by server code using the service-role client (after a role
-- check). `authenticated` gets scoped SELECT via RLS. Owners may additionally
-- manage compensation rules, production entities, and writing-agent aliases.

-- ============================================================================
-- Account level + agent classification
-- ============================================================================

alter table public.agencies
  add column if not exists account_type text not null default 'agency'
    check (account_type in ('agency', 'individual'));

alter table public.users
  add column if not exists agent_type text
    check (agent_type in ('career', 'independent')),
  add column if not exists career_level text
    check (career_level in (
      'Benefit Consultant',
      'Senior Benefit Consultant',
      'Client Advisor',
      'Private Client Advisor'
    )),
  add column if not exists active boolean not null default true;

-- A career level exists exactly when the user is a Career Agent.
alter table public.users
  drop constraint if exists users_career_level_matches_type;
alter table public.users
  add constraint users_career_level_matches_type
  check ((agent_type is not distinct from 'career') = (career_level is not null));

-- ============================================================================
-- Shared trigger: make rows append-only
-- ============================================================================

create or replace function public.prevent_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception '% rows are immutable', tg_table_name
    using errcode = 'check_violation';
end;
$$;

-- ============================================================================
-- Production entities + writing-agent aliases
-- ============================================================================

-- Personal production (an owner's own writing-agent business) is reported
-- separately from agency production and must never be mixed with it.
create table if not exists public.production_entities (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies (id) on delete cascade,
  name text not null,
  entity_type text not null check (entity_type in ('agency', 'personal')),
  user_id uuid references public.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (agency_id, name),
  check ((entity_type = 'personal') = (user_id is not null))
);

create index if not exists production_entities_agency_id_idx
  on public.production_entities (agency_id);

-- Maps the writing-agent name printed on a carrier statement to one of our
-- users. Aliases are stored normalized (see normalizeWritingAgentName):
-- upper-cased, commas removed, whitespace collapsed. Exact match only.
create table if not exists public.writing_agent_aliases (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  alias text not null check (alias = upper(btrim(alias)) and alias <> ''),
  created_at timestamptz not null default now(),
  unique (agency_id, alias)
);

create index if not exists writing_agent_aliases_user_id_idx
  on public.writing_agent_aliases (user_id);

-- ============================================================================
-- Carrier connections (portal logins) + encrypted credentials
-- ============================================================================

create table if not exists public.carrier_connections (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies (id) on delete cascade,
  -- The agent whose carrier account this is. Never shared across agents.
  user_id uuid not null references public.users (id) on delete cascade,
  carrier text not null,
  status text not null default 'pending'
    check (status in ('pending', 'active', 'needs_attention', 'disabled')),
  last_sync_at timestamptz,
  last_successful_sync_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  unique (agency_id, user_id, carrier)
);

create index if not exists carrier_connections_user_id_idx
  on public.carrier_connections (user_id);

-- Portal username/password, encrypted by the app before insert (AES-GCM with a
-- server-only key). Deliberately separate from carrier_connections so the
-- ciphertext can never be returned by a broad `select *` on connections.
-- No RLS policies and no grants for anon/authenticated: service role only.
-- TODO: move to Supabase Vault once it is enabled for the project.
create table if not exists public.carrier_credentials (
  connection_id uuid primary key references public.carrier_connections (id) on delete cascade,
  agency_id uuid not null references public.agencies (id) on delete cascade,
  ciphertext text not null,
  updated_at timestamptz not null default now()
);

-- ============================================================================
-- Statements + carrier transactions (what the carrier actually paid)
-- ============================================================================

create table if not exists public.commission_statements (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies (id) on delete cascade,
  -- The payee whose statement this is. Null = agency-level upload, Owner-only.
  user_id uuid references public.users (id),
  connection_id uuid references public.carrier_connections (id) on delete set null,
  carrier text not null,
  statement_month text not null check (statement_month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  source text not null check (source in ('upload', 'portal')),
  carrier_statement_id text,
  original_filename text,
  -- Private Supabase Storage object key, never an absolute filesystem path.
  storage_path text,
  -- SHA-256 of the PDF bytes: the same file can only be registered once.
  file_hash text not null check (file_hash ~ '^[a-f0-9]{64}$'),
  statement_total_cents bigint,
  carried_balance_cents bigint,
  transaction_count integer,
  status text not null default 'received'
    check (status in ('received', 'previewed', 'imported', 'failed')),
  error_message text,
  uploaded_by uuid references public.users (id),
  imported_by uuid references public.users (id),
  imported_at timestamptz,
  created_at timestamptz not null default now(),
  unique (agency_id, file_hash)
);

create unique index if not exists commission_statements_connection_external_id
  on public.commission_statements (connection_id, carrier_statement_id)
  where carrier_statement_id is not null;

create index if not exists commission_statements_agency_month_idx
  on public.commission_statements (agency_id, statement_month);

create table if not exists public.carrier_transactions (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies (id) on delete cascade,
  statement_id uuid not null references public.commission_statements (id),
  carrier text not null,
  statement_month text not null check (statement_month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  carrier_member_id text not null,
  effective_date date not null,
  -- Carrier payment category, as printed (COMMISSION, RENEWAL, CHARGEBACK,
  -- ADJUSTMENT, OVERRIDE, ...). Signed amounts: chargebacks are negative.
  commission_type text not null,
  amount_cents bigint not null,
  transaction_key text not null,
  writing_agent_name text,
  writing_agent_verified boolean not null default false,
  -- Matched agent. Null = unassigned; stays null until a human reviews it.
  user_id uuid references public.users (id),
  production_entity_id uuid references public.production_entities (id),
  created_at timestamptz not null default now(),
  unique (agency_id, transaction_key)
);

create index if not exists carrier_transactions_agency_id_idx
  on public.carrier_transactions (agency_id);
create index if not exists carrier_transactions_statement_id_idx
  on public.carrier_transactions (statement_id);
create index if not exists carrier_transactions_user_id_idx
  on public.carrier_transactions (user_id);

-- ============================================================================
-- Compensation rules (effective-dated) + immutable per-policy rate locks
-- ============================================================================

create table if not exists public.compensation_rules (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies (id) on delete cascade,
  agent_type text not null check (agent_type in ('career', 'independent')),
  career_level text check (career_level in (
    'Benefit Consultant',
    'Senior Benefit Consultant',
    'Client Advisor',
    'Private Client Advisor'
  )),
  product text not null,
  commission_type text not null,
  calculation_method text not null check (calculation_method in ('FIXED', 'PERCENT')),
  -- FIXED rules store integer cents; PERCENT rules store whole percentage
  -- points (70 means 70%).
  rate_cents bigint check (rate_cents >= 0),
  rate_percent numeric(7, 4) check (rate_percent >= 0 and rate_percent <= 100),
  -- Missing rates stay NOT_CONFIGURED. They are never treated as zero.
  status text not null default 'NOT_CONFIGURED'
    check (status in ('ACTIVE', 'NOT_CONFIGURED')),
  effective_from date not null,
  effective_to date,
  created_at timestamptz not null default now(),
  check (effective_to is null or effective_to >= effective_from),
  check (
    status = 'NOT_CONFIGURED'
    or (calculation_method = 'FIXED' and rate_cents is not null and rate_percent is null)
    or (calculation_method = 'PERCENT' and rate_percent is not null and rate_cents is null)
  )
);

create index if not exists compensation_rules_lookup_idx
  on public.compensation_rules (agency_id, agent_type, career_level, product, commission_type);

create table if not exists public.policy_compensation_locks (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies (id) on delete cascade,
  carrier text not null,
  -- Exact carrier enrollment/version key. A member id alone is not enough.
  policy_key text not null,
  carrier_member_id text not null,
  user_id uuid not null references public.users (id),
  product text not null check (product = 'MAPD'),
  written_date date not null,
  career_level_at_write text not null check (career_level_at_write in (
    'Benefit Consultant',
    'Senior Benefit Consultant',
    'Client Advisor',
    'Private Client Advisor'
  )),
  sale_category text not null check (sale_category in ('T65', 'PLAN_CHANGE')),
  sale_rate_cents bigint not null check (sale_rate_cents >= 0),
  renewal_rate_cents bigint not null check (renewal_rate_cents >= 0),
  sale_rule_id uuid not null references public.compensation_rules (id),
  renewal_rule_id uuid not null references public.compensation_rules (id),
  evidence_reference text not null check (btrim(evidence_reference) <> ''),
  created_at timestamptz not null default now(),
  unique (agency_id, carrier, policy_key)
);

create index if not exists policy_compensation_locks_member_idx
  on public.policy_compensation_locks (agency_id, carrier, carrier_member_id);

drop trigger if exists policy_locks_immutable on public.policy_compensation_locks;
create trigger policy_locks_immutable
  before update or delete on public.policy_compensation_locks
  for each row execute function public.prevent_mutation();

-- ============================================================================
-- Payout batches + agent earnings (Career Agents only)
-- ============================================================================

create table if not exists public.payout_batches (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies (id) on delete cascade,
  period_start date not null,
  period_end date not null,
  status text not null default 'DRAFT' check (status in ('DRAFT', 'APPROVED', 'PAID')),
  approved_by uuid references public.users (id),
  approved_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  check (period_end >= period_start)
);

create index if not exists payout_batches_agency_id_idx
  on public.payout_batches (agency_id);

-- What the agency owes a Career Agent for one carrier payment. Created as
-- PENDING with no payable amount; approval and payment are separate steps.
create table if not exists public.agent_earnings (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies (id) on delete cascade,
  user_id uuid not null references public.users (id),
  carrier_transaction_id uuid not null unique references public.carrier_transactions (id),
  earned_amount_cents bigint not null check (earned_amount_cents >= 0),
  payable_amount_cents bigint check (payable_amount_cents >= 0),
  status text not null default 'PENDING'
    check (status in ('PENDING', 'APPROVED', 'PAID', 'VOID')),
  payout_batch_id uuid references public.payout_batches (id),
  created_at timestamptz not null default now()
);

create index if not exists agent_earnings_agency_id_idx
  on public.agent_earnings (agency_id);
create index if not exists agent_earnings_user_id_idx
  on public.agent_earnings (user_id);

-- Immutable provenance for every earning: which policy lock and which
-- carrier payment/evidence justified it. earning_key blocks paying the same
-- sale or monthly renewal entitlement twice.
create table if not exists public.career_earning_sources (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies (id) on delete cascade,
  carrier_transaction_id uuid not null unique references public.carrier_transactions (id),
  policy_lock_id uuid not null references public.policy_compensation_locks (id),
  agent_earning_id uuid not null unique references public.agent_earnings (id),
  earning_key text not null,
  source_signature text not null,
  carrier_category text not null,
  renewal_month text check (renewal_month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  evidence_reference text not null check (btrim(evidence_reference) <> ''),
  created_at timestamptz not null default now(),
  unique (agency_id, earning_key)
);

drop trigger if exists career_sources_immutable on public.career_earning_sources;
create trigger career_sources_immutable
  before update or delete on public.career_earning_sources
  for each row execute function public.prevent_mutation();

create table if not exists public.career_earning_runs (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies (id) on delete cascade,
  review_signature text not null,
  approved_by uuid not null references public.users (id),
  earnings_created integer not null check (earnings_created >= 0),
  earnings_skipped integer not null check (earnings_skipped >= 0),
  created_at timestamptz not null default now()
);

-- ============================================================================
-- Audit trail (append-only)
-- ============================================================================

create table if not exists public.audit_events (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies (id) on delete cascade,
  actor_user_id uuid references public.users (id),
  action text not null,
  entity_type text not null,
  entity_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists audit_events_agency_created_idx
  on public.audit_events (agency_id, created_at desc);

drop trigger if exists audit_events_immutable on public.audit_events;
create trigger audit_events_immutable
  before update or delete on public.audit_events
  for each row execute function public.prevent_mutation();

-- ============================================================================
-- Grants
-- ============================================================================
-- Read-only for signed-in users on append-only/financial tables (RLS scopes
-- the rows). Only Owner-managed configuration tables are writable by
-- `authenticated`, and RLS still restricts that to Owners of the agency.

grant select on
  public.production_entities,
  public.writing_agent_aliases,
  public.carrier_connections,
  public.commission_statements,
  public.carrier_transactions,
  public.compensation_rules,
  public.policy_compensation_locks,
  public.payout_batches,
  public.agent_earnings,
  public.career_earning_sources,
  public.career_earning_runs,
  public.audit_events
to authenticated;

grant insert, update, delete on
  public.production_entities,
  public.writing_agent_aliases
to authenticated;

grant insert, update on public.compensation_rules to authenticated;

grant select, insert, update, delete on
  public.production_entities,
  public.writing_agent_aliases,
  public.carrier_connections,
  public.carrier_credentials,
  public.commission_statements,
  public.carrier_transactions,
  public.compensation_rules,
  public.policy_compensation_locks,
  public.payout_batches,
  public.agent_earnings,
  public.career_earning_sources,
  public.career_earning_runs,
  public.audit_events
to service_role;

-- 0001's default privileges also hand `authenticated`/`anon` access to future
-- tables; take that back for everything this migration creates.
revoke all on
  public.production_entities,
  public.writing_agent_aliases,
  public.carrier_connections,
  public.carrier_credentials,
  public.commission_statements,
  public.carrier_transactions,
  public.compensation_rules,
  public.policy_compensation_locks,
  public.payout_batches,
  public.agent_earnings,
  public.career_earning_sources,
  public.career_earning_runs,
  public.audit_events
from anon;

revoke all on public.carrier_credentials from authenticated;

revoke update, delete, insert on
  public.carrier_connections,
  public.commission_statements,
  public.carrier_transactions,
  public.policy_compensation_locks,
  public.payout_batches,
  public.agent_earnings,
  public.career_earning_sources,
  public.career_earning_runs,
  public.audit_events
from authenticated;

revoke delete on public.compensation_rules from authenticated;

-- ============================================================================
-- Row Level Security
-- ============================================================================

alter table public.production_entities enable row level security;
alter table public.writing_agent_aliases enable row level security;
alter table public.carrier_connections enable row level security;
alter table public.carrier_credentials enable row level security;
alter table public.commission_statements enable row level security;
alter table public.carrier_transactions enable row level security;
alter table public.compensation_rules enable row level security;
alter table public.policy_compensation_locks enable row level security;
alter table public.payout_batches enable row level security;
alter table public.agent_earnings enable row level security;
alter table public.career_earning_sources enable row level security;
alter table public.career_earning_runs enable row level security;
alter table public.audit_events enable row level security;

-- carrier_credentials: intentionally no policies (service role only).

-- Owner-only configuration: production entities and writing-agent aliases.
create policy "production_entities_owner_select" on public.production_entities
  for select using (
    agency_id = public.get_my_agency_id() and public.get_my_role() = 'owner'
  );
create policy "production_entities_owner_insert" on public.production_entities
  for insert to authenticated
  with check (agency_id = public.get_my_agency_id() and public.get_my_role() = 'owner');
create policy "production_entities_owner_update" on public.production_entities
  for update using (
    agency_id = public.get_my_agency_id() and public.get_my_role() = 'owner'
  );
create policy "production_entities_owner_delete" on public.production_entities
  for delete using (
    agency_id = public.get_my_agency_id() and public.get_my_role() = 'owner'
  );

create policy "writing_agent_aliases_owner_select" on public.writing_agent_aliases
  for select using (
    agency_id = public.get_my_agency_id() and public.get_my_role() = 'owner'
  );
create policy "writing_agent_aliases_owner_insert" on public.writing_agent_aliases
  for insert to authenticated
  with check (agency_id = public.get_my_agency_id() and public.get_my_role() = 'owner');
create policy "writing_agent_aliases_owner_update" on public.writing_agent_aliases
  for update using (
    agency_id = public.get_my_agency_id() and public.get_my_role() = 'owner'
  );
create policy "writing_agent_aliases_owner_delete" on public.writing_agent_aliases
  for delete using (
    agency_id = public.get_my_agency_id() and public.get_my_role() = 'owner'
  );

-- Carrier connections: Owner, or the agent whose account it is. Never peers.
create policy "carrier_connections_owner_or_self_select" on public.carrier_connections
  for select using (
    agency_id = public.get_my_agency_id()
    and (public.get_my_role() = 'owner' or user_id = auth.uid())
  );

-- Compensation rules: readable agency-wide (agents can see how they are
-- paid), editable by Owners. No delete: locks reference rules.
create policy "compensation_rules_select_same_agency" on public.compensation_rules
  for select using (agency_id = public.get_my_agency_id());
create policy "compensation_rules_owner_insert" on public.compensation_rules
  for insert to authenticated
  with check (agency_id = public.get_my_agency_id() and public.get_my_role() = 'owner');
create policy "compensation_rules_owner_update" on public.compensation_rules
  for update using (
    agency_id = public.get_my_agency_id() and public.get_my_role() = 'owner'
  );

-- Statements, transactions, locks, earnings: Owners see the whole agency;
-- Managers see their own and direct reports'; everyone else sees only
-- their own. Rows with a null user_id (unassigned) are Owner-only.
create policy "commission_statements_scoped_select" on public.commission_statements
  for select using (
    agency_id = public.get_my_agency_id()
    and (
      public.get_my_role() = 'owner'
      or user_id = auth.uid()
      or user_id in (select id from public.users where manager_id = auth.uid())
    )
  );

create policy "carrier_transactions_scoped_select" on public.carrier_transactions
  for select using (
    agency_id = public.get_my_agency_id()
    and (
      public.get_my_role() = 'owner'
      or user_id = auth.uid()
      or user_id in (select id from public.users where manager_id = auth.uid())
    )
  );

create policy "policy_compensation_locks_scoped_select" on public.policy_compensation_locks
  for select using (
    agency_id = public.get_my_agency_id()
    and (
      public.get_my_role() = 'owner'
      or user_id = auth.uid()
      or user_id in (select id from public.users where manager_id = auth.uid())
    )
  );

create policy "agent_earnings_scoped_select" on public.agent_earnings
  for select using (
    agency_id = public.get_my_agency_id()
    and (
      public.get_my_role() = 'owner'
      or user_id = auth.uid()
      or user_id in (select id from public.users where manager_id = auth.uid())
    )
  );

-- Owner-only: payout batches, earning provenance/runs, audit trail.
create policy "payout_batches_owner_select" on public.payout_batches
  for select using (
    agency_id = public.get_my_agency_id() and public.get_my_role() = 'owner'
  );
create policy "career_earning_sources_owner_select" on public.career_earning_sources
  for select using (
    agency_id = public.get_my_agency_id() and public.get_my_role() = 'owner'
  );
create policy "career_earning_runs_owner_select" on public.career_earning_runs
  for select using (
    agency_id = public.get_my_agency_id() and public.get_my_role() = 'owner'
  );
create policy "audit_events_owner_select" on public.audit_events
  for select using (
    agency_id = public.get_my_agency_id() and public.get_my_role() = 'owner'
  );
