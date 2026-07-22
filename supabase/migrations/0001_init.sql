-- CommissionFlow MVP schema
-- Multi-tenant: every major table carries (directly or transitively) an
-- agency_id, and Row Level Security enforces tenant + role scoping.

create extension if not exists pgcrypto;

-- ============================================================================
-- Tables
-- ============================================================================

create table if not exists public.agencies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

-- 1:1 with auth.users. Holds the app-level profile (agency, role, hierarchy).
create table if not exists public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  agency_id uuid not null references public.agencies (id) on delete cascade,
  first_name text not null,
  last_name text not null,
  email text not null unique,
  role text not null check (role in ('owner', 'manager', 'agent')),
  manager_id uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists users_agency_id_idx on public.users (agency_id);
create index if not exists users_manager_id_idx on public.users (manager_id);

-- Configurable commission percentages. MVP supports one active plan per
-- agency; percentages are read at commission-generation time, never
-- hardcoded in application code.
create table if not exists public.commission_plans (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies (id) on delete cascade,
  name text not null default 'Standard Plan',
  active boolean not null default true,
  agent_percent numeric(6, 3) not null default 10,
  manager_percent numeric(6, 3) not null default 2,
  owner_percent numeric(6, 3) not null default 1,
  created_at timestamptz not null default now()
);

create index if not exists commission_plans_agency_id_idx on public.commission_plans (agency_id);

-- One row per commission "line". A single enrolled opportunity produces up
-- to three rows: the agent, their manager's override, and the owner's
-- override.
create table if not exists public.commission_transactions (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  opportunity_id text not null,
  role text not null check (role in ('agent', 'manager', 'owner')),
  sale_amount numeric(12, 2) not null,
  commission_amount numeric(12, 2) not null,
  commission_plan_id uuid references public.commission_plans (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists commission_transactions_agency_id_idx on public.commission_transactions (agency_id);
create index if not exists commission_transactions_user_id_idx on public.commission_transactions (user_id);
create index if not exists commission_transactions_opportunity_id_idx on public.commission_transactions (opportunity_id);

-- One CRM connection per agency for MVP (GoHighLevel only).
-- TODO: access_token/refresh_token are plaintext for MVP speed - encrypt
-- at rest (Supabase Vault/pgsodium) before handling real credentials.
create table if not exists public.crm_connections (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies (id) on delete cascade,
  provider text not null,
  access_token text,
  refresh_token text,
  last_sync_at timestamptz,
  created_at timestamptz not null default now(),
  unique (agency_id, provider)
);

-- ============================================================================
-- Helper functions (SECURITY DEFINER so RLS policies can look up the
-- caller's agency/role without recursing into the `users` policies below).
-- ============================================================================

create or replace function public.get_my_agency_id()
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select agency_id from public.users where id = auth.uid();
$$;

create or replace function public.get_my_role()
returns text
language sql
security definer
set search_path = public
stable
as $$
  select role from public.users where id = auth.uid();
$$;

grant execute on function public.get_my_agency_id() to authenticated;
grant execute on function public.get_my_role() to authenticated;

-- Table-level grants so RLS policies can take effect. Without these,
-- authenticated queries fail with "permission denied" and the dashboard
-- cannot load the signed-in user's profile.
grant usage on schema public to anon, authenticated, service_role;

grant select, insert, update, delete on all tables in schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to service_role;
grant select on all tables in schema public to anon;

alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;

alter default privileges in schema public
  grant select, insert, update, delete on tables to service_role;

alter default privileges in schema public
  grant select on tables to anon;

-- ============================================================================
-- Row Level Security
-- ============================================================================

alter table public.agencies enable row level security;
alter table public.users enable row level security;
alter table public.commission_plans enable row level security;
alter table public.commission_transactions enable row level security;
alter table public.crm_connections enable row level security;

-- Agencies: any signed-in user can see their own agency; creating a new
-- agency is how signup works, so any authenticated user may insert one.
create policy "agencies_select_own" on public.agencies
  for select using (id = public.get_my_agency_id());

create policy "agencies_insert_authenticated" on public.agencies
  for insert to authenticated
  with check (true);

-- Users: visible to anyone in the same agency (or yourself, before your
-- profile row exists and get_my_agency_id() can't resolve yet). Only
-- Owners can modify teammates; self-insert is allowed for the signup flow.
create policy "users_select_same_agency_or_self" on public.users
  for select using (
    agency_id = public.get_my_agency_id() or id = auth.uid()
  );

create policy "users_insert_self_or_owner" on public.users
  for insert to authenticated
  with check (
    id = auth.uid()
    or (public.get_my_role() = 'owner' and agency_id = public.get_my_agency_id())
  );

create policy "users_update_owner_only" on public.users
  for update using (
    public.get_my_role() = 'owner' and agency_id = public.get_my_agency_id()
  );

-- Commission plans: read-only for the whole agency, editable by Owners.
create policy "commission_plans_select_same_agency" on public.commission_plans
  for select using (agency_id = public.get_my_agency_id());

create policy "commission_plans_insert_owner" on public.commission_plans
  for insert to authenticated
  with check (
    agency_id = public.get_my_agency_id() and public.get_my_role() = 'owner'
  );

create policy "commission_plans_update_owner" on public.commission_plans
  for update using (
    agency_id = public.get_my_agency_id() and public.get_my_role() = 'owner'
  );

-- Commission transactions: Owners see everything in the agency; Managers
-- see their own + their direct reports'; Agents see only their own.
create policy "commission_transactions_scoped_select" on public.commission_transactions
  for select using (
    agency_id = public.get_my_agency_id()
    and (
      public.get_my_role() = 'owner'
      or user_id = auth.uid()
      or user_id in (select id from public.users where manager_id = auth.uid())
    )
  );

create policy "commission_transactions_insert_same_agency" on public.commission_transactions
  for insert to authenticated
  with check (agency_id = public.get_my_agency_id());

-- CRM connections: Owner-only, scoped to their agency.
create policy "crm_connections_owner_select" on public.crm_connections
  for select using (
    agency_id = public.get_my_agency_id() and public.get_my_role() = 'owner'
  );

create policy "crm_connections_owner_insert" on public.crm_connections
  for insert to authenticated
  with check (
    agency_id = public.get_my_agency_id() and public.get_my_role() = 'owner'
  );

create policy "crm_connections_owner_update" on public.crm_connections
  for update using (
    agency_id = public.get_my_agency_id() and public.get_my_role() = 'owner'
  );
