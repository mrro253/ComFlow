-- Comp Plans v2: multiple named plans per agency, New Business vs Renewal
-- rates, and basic monthly enrollment bonuses.
--
-- Design notes:
--  - Rates move off `commission_plans` into a normalized
--    `commission_plan_rates` table (role x business_type -> percent) so a
--    plan can hold different numbers for new business vs renewals without
--    an ever-growing set of flat columns, and so future rate dimensions
--    (e.g. per-product) slot in the same way.
--  - Each user can be assigned a specific plan (`users.commission_plan_id`);
--    a null assignment falls back to the agency's default plan
--    (`commission_plans.is_default`). This is deliberately NOT a full
--    LOA/GA/MGA hierarchy-wide assignment system - just enough plumbing
--    for "multiple plans" to be meaningful within the existing
--    Owner/Manager/Agent model.
--  - Bonuses are monthly-enrollment-count thresholds per role, manually
--    awarded by an Owner (no cron/automation) - `commission_bonus_awards`
--    prevents double-awarding the same bonus to the same person in the
--    same calendar month.

-- ============================================================================
-- commission_plans: drop flat percent columns, add is_default
-- ============================================================================

alter table public.commission_plans
  drop column if exists agent_percent,
  drop column if exists manager_percent,
  drop column if exists owner_percent,
  add column if not exists is_default boolean not null default false;

-- Only one default plan per agency at a time.
create unique index if not exists commission_plans_one_default_per_agency
  on public.commission_plans (agency_id)
  where is_default;

-- ============================================================================
-- commission_plan_rates: role x business_type -> percent, per plan
-- ============================================================================

create table if not exists public.commission_plan_rates (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies (id) on delete cascade,
  commission_plan_id uuid not null references public.commission_plans (id) on delete cascade,
  role text not null check (role in ('agent', 'manager', 'owner')),
  business_type text not null check (business_type in ('new', 'renewal')),
  percent numeric(6, 3) not null default 0,
  created_at timestamptz not null default now(),
  unique (commission_plan_id, role, business_type)
);

create index if not exists commission_plan_rates_plan_id_idx
  on public.commission_plan_rates (commission_plan_id);

-- ============================================================================
-- commission_plan_bonuses: flat $ bonus at N enrollments/month, per role
-- ============================================================================

create table if not exists public.commission_plan_bonuses (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies (id) on delete cascade,
  commission_plan_id uuid not null references public.commission_plans (id) on delete cascade,
  role text not null check (role in ('agent', 'manager', 'owner')),
  threshold_count integer not null check (threshold_count > 0),
  bonus_amount numeric(12, 2) not null check (bonus_amount >= 0),
  created_at timestamptz not null default now()
);

create index if not exists commission_plan_bonuses_plan_id_idx
  on public.commission_plan_bonuses (commission_plan_id);

-- ============================================================================
-- commission_bonus_awards: one row per (bonus, person, calendar month)
-- ============================================================================

create table if not exists public.commission_bonus_awards (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies (id) on delete cascade,
  commission_plan_bonus_id uuid not null references public.commission_plan_bonuses (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  -- Calendar month the bonus was earned in, e.g. '2026-07'.
  period text not null,
  commission_transaction_id uuid references public.commission_transactions (id) on delete set null,
  awarded_at timestamptz not null default now(),
  unique (commission_plan_bonus_id, user_id, period)
);

create index if not exists commission_bonus_awards_user_id_idx
  on public.commission_bonus_awards (user_id);

-- ============================================================================
-- users: optional plan assignment (falls back to the agency default plan)
-- ============================================================================

alter table public.users
  add column if not exists commission_plan_id uuid references public.commission_plans (id) on delete set null;

-- ============================================================================
-- commission_transactions: business_type + a 'bonus' role for payouts
-- ============================================================================

alter table public.commission_transactions
  add column if not exists business_type text not null default 'new' check (business_type in ('new', 'renewal'));

alter table public.commission_transactions
  drop constraint if exists commission_transactions_role_check;

alter table public.commission_transactions
  add constraint commission_transactions_role_check
  check (role in ('agent', 'manager', 'owner', 'bonus'));

-- ============================================================================
-- Grants (new tables need these explicitly even though 0001 sets default
-- privileges for future tables, since that only covers objects created by
-- the same role that ran ALTER DEFAULT PRIVILEGES).
-- ============================================================================

grant select, insert, update, delete on public.commission_plan_rates to authenticated;
grant select, insert, update, delete on public.commission_plan_rates to service_role;
grant select on public.commission_plan_rates to anon;

grant select, insert, update, delete on public.commission_plan_bonuses to authenticated;
grant select, insert, update, delete on public.commission_plan_bonuses to service_role;
grant select on public.commission_plan_bonuses to anon;

grant select, insert, update, delete on public.commission_bonus_awards to authenticated;
grant select, insert, update, delete on public.commission_bonus_awards to service_role;
grant select on public.commission_bonus_awards to anon;

-- ============================================================================
-- Row Level Security
-- ============================================================================

alter table public.commission_plan_rates enable row level security;
alter table public.commission_plan_bonuses enable row level security;
alter table public.commission_bonus_awards enable row level security;

-- Rates/bonuses are readable by the whole agency (agents can see why
-- they're paid what they're paid) but only editable by Owners.
create policy "commission_plan_rates_select_same_agency" on public.commission_plan_rates
  for select using (agency_id = public.get_my_agency_id());

create policy "commission_plan_rates_write_owner" on public.commission_plan_rates
  for insert to authenticated
  with check (agency_id = public.get_my_agency_id() and public.get_my_role() = 'owner');

create policy "commission_plan_rates_update_owner" on public.commission_plan_rates
  for update using (agency_id = public.get_my_agency_id() and public.get_my_role() = 'owner');

create policy "commission_plan_rates_delete_owner" on public.commission_plan_rates
  for delete using (agency_id = public.get_my_agency_id() and public.get_my_role() = 'owner');

create policy "commission_plan_bonuses_select_same_agency" on public.commission_plan_bonuses
  for select using (agency_id = public.get_my_agency_id());

create policy "commission_plan_bonuses_write_owner" on public.commission_plan_bonuses
  for insert to authenticated
  with check (agency_id = public.get_my_agency_id() and public.get_my_role() = 'owner');

create policy "commission_plan_bonuses_delete_owner" on public.commission_plan_bonuses
  for delete using (agency_id = public.get_my_agency_id() and public.get_my_role() = 'owner');

-- Bonus awards: visible agency-wide (same reasoning as transactions),
-- insertable only by Owners (they're the ones clicking "Award").
create policy "commission_bonus_awards_select_same_agency" on public.commission_bonus_awards
  for select using (agency_id = public.get_my_agency_id());

create policy "commission_bonus_awards_insert_owner" on public.commission_bonus_awards
  for insert to authenticated
  with check (agency_id = public.get_my_agency_id() and public.get_my_role() = 'owner');
