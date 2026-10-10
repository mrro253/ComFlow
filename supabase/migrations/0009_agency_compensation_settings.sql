-- Per-agency compensation settings (Ryan's 2026-10-10 answers) and payout removal.
--
--  1. career_levels: each agency defines its own level names, order and
--     visibility. Replaces the TruePlan names that were hard-coded in CHECK
--     constraints on users, compensation_rules and policy_compensation_locks.
--     Existing level names are copied into career_levels first, so nothing
--     already stored becomes invalid. Level names are never renamed or deleted
--     (rate locks keep the level they were written under); levels are
--     deactivated instead.
--  2. Level visibility: a level can be allowed to see its direct reports'
--     payments and statements ("direct_reports") or only its own ("own").
--     Managers (role) always see their direct reports.
--  3. agencies.bonuses_enabled: bonuses are an optional per-agency setting, off
--     by default. Nothing computes bonuses from carrier statements yet.
--  4. compensation_rules.percent_basis: percent rules (for example final
--     expense) are a percent of ANNUAL_PREMIUM.
--  5. Payouts are removed for now: payout_batches, agent_earnings.payout_batch_id
--     and the PAID earning status. Earnings (carrier receipt + owner approval)
--     stay. The migration refuses to run if any payout data exists.

-- ============================================================================
-- 1. Career levels per agency
-- ============================================================================

create table if not exists public.career_levels (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies (id) on delete cascade,
  name text not null check (btrim(name) <> '' and char_length(name) <= 60),
  -- Lowest level first.
  rank integer not null check (rank >= 1),
  visibility text not null default 'own' check (visibility in ('own', 'direct_reports')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (agency_id, name)
);

create index if not exists career_levels_agency_idx on public.career_levels (agency_id, rank);

-- One-time copy of the level names already in use (TruePlan's, in their known
-- order), so the foreign keys below can be added without losing anything.
insert into public.career_levels (agency_id, name, rank)
select
  agency_id,
  career_level,
  row_number() over (
    partition by agency_id
    order by
      case career_level
        when 'Benefit Consultant' then 1
        when 'Senior Benefit Consultant' then 2
        when 'Client Advisor' then 3
        when 'Private Client Advisor' then 4
        else 99
      end,
      career_level
  )
from (
  select agency_id, career_level from public.users where career_level is not null
  union
  select agency_id, career_level from public.compensation_rules where career_level is not null
  union
  select agency_id, career_level_at_write from public.policy_compensation_locks
) used
on conflict (agency_id, name) do nothing;

alter table public.users drop constraint if exists users_career_level_check;
alter table public.compensation_rules drop constraint if exists compensation_rules_career_level_check;
alter table public.policy_compensation_locks drop constraint if exists policy_compensation_locks_career_level_at_write_check;

alter table public.users drop constraint if exists users_career_level_fk;
alter table public.users
  add constraint users_career_level_fk
  foreign key (agency_id, career_level) references public.career_levels (agency_id, name);

alter table public.compensation_rules drop constraint if exists compensation_rules_career_level_fk;
alter table public.compensation_rules
  add constraint compensation_rules_career_level_fk
  foreign key (agency_id, career_level) references public.career_levels (agency_id, name);

alter table public.policy_compensation_locks drop constraint if exists policy_compensation_locks_career_level_fk;
alter table public.policy_compensation_locks
  add constraint policy_compensation_locks_career_level_fk
  foreign key (agency_id, career_level_at_write) references public.career_levels (agency_id, name);

-- Names are fixed once created (locks and rules refer to them).
create or replace function public.career_levels_name_fixed()
returns trigger
language plpgsql
as $$
begin
  if new.name is distinct from old.name or new.agency_id is distinct from old.agency_id then
    raise exception 'A career level name cannot be changed; add a new level instead';
  end if;
  return new;
end;
$$;

drop trigger if exists career_levels_name_fixed on public.career_levels;
create trigger career_levels_name_fixed
  before update on public.career_levels
  for each row execute function public.career_levels_name_fixed();

-- Same shape as the other Owner-managed configuration: everyone in the agency
-- can read; only server code (service role) writes, after an Owner role check.
grant select on public.career_levels to authenticated;
grant select, insert, update, delete on public.career_levels to service_role;
revoke all on public.career_levels from anon;
revoke insert, update, delete on public.career_levels from authenticated;

alter table public.career_levels enable row level security;
drop policy if exists "career_levels_select_same_agency" on public.career_levels;
create policy "career_levels_select_same_agency" on public.career_levels
  for select using (agency_id = public.get_my_agency_id());

-- ============================================================================
-- 2. Level visibility in Row Level Security
-- ============================================================================

-- True when the signed-in user may see their direct reports' business: they are
-- a Manager, or their career level is set to "direct_reports".
create or replace function public.can_see_direct_reports()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select u.role = 'manager' or coalesce(cl.visibility = 'direct_reports', false)
      from public.users u
      left join public.career_levels cl
        on cl.agency_id = u.agency_id and cl.name = u.career_level
      where u.id = auth.uid()
    ),
    false
  );
$$;

revoke all on function public.can_see_direct_reports() from public;
grant execute on function public.can_see_direct_reports() to authenticated, service_role;

drop policy if exists "commission_statements_scoped_select" on public.commission_statements;
create policy "commission_statements_scoped_select" on public.commission_statements
  for select using (
    agency_id = public.get_my_agency_id()
    and (
      public.get_my_role() = 'owner'
      or user_id = auth.uid()
      or (
        public.can_see_direct_reports()
        and user_id in (select id from public.users where manager_id = auth.uid())
      )
    )
  );

drop policy if exists "carrier_transactions_scoped_select" on public.carrier_transactions;
create policy "carrier_transactions_scoped_select" on public.carrier_transactions
  for select using (
    agency_id = public.get_my_agency_id()
    and (
      public.get_my_role() = 'owner'
      or user_id = auth.uid()
      or writing_user_id = auth.uid()
      or (
        public.can_see_direct_reports()
        and user_id in (select id from public.users where manager_id = auth.uid())
      )
    )
  );

drop policy if exists "policy_compensation_locks_scoped_select" on public.policy_compensation_locks;
create policy "policy_compensation_locks_scoped_select" on public.policy_compensation_locks
  for select using (
    agency_id = public.get_my_agency_id()
    and (
      public.get_my_role() = 'owner'
      or user_id = auth.uid()
      or (
        public.can_see_direct_reports()
        and user_id in (select id from public.users where manager_id = auth.uid())
      )
    )
  );

drop policy if exists "agent_earnings_scoped_select" on public.agent_earnings;
create policy "agent_earnings_scoped_select" on public.agent_earnings
  for select using (
    agency_id = public.get_my_agency_id()
    and (
      public.get_my_role() = 'owner'
      or user_id = auth.uid()
      or (
        public.can_see_direct_reports()
        and user_id in (select id from public.users where manager_id = auth.uid())
      )
    )
  );

-- ============================================================================
-- 3. Bonuses on/off, 4. percent rules
-- ============================================================================

alter table public.agencies
  add column if not exists bonuses_enabled boolean not null default false;

alter table public.compensation_rules
  add column if not exists percent_basis text
    check (percent_basis in ('ANNUAL_PREMIUM'));

alter table public.compensation_rules drop constraint if exists compensation_rules_percent_basis_matches;
alter table public.compensation_rules
  add constraint compensation_rules_percent_basis_matches
  check (percent_basis is null or calculation_method = 'PERCENT');

-- ============================================================================
-- 5. Remove payouts
-- ============================================================================

do $$
begin
  if exists (select 1 from public.payout_batches)
     or exists (select 1 from public.agent_earnings where status = 'PAID' or payout_batch_id is not null) then
    raise exception 'Payout data exists; refusing to remove the payout tables. Review it first.';
  end if;
end $$;

alter table public.agent_earnings drop column if exists payout_batch_id;
alter table public.agent_earnings drop constraint if exists agent_earnings_status_check;
alter table public.agent_earnings
  add constraint agent_earnings_status_check
  check (status in ('PENDING', 'APPROVED', 'VOID'));

drop table if exists public.payout_batches;
