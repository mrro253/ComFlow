-- Owner signup hardening + lightweight Owner onboarding.
--
-- Two independent changes:
--
-- 1. `agencies.onboarding_completed_at` - a single nullable timestamp that
--    gates the Owner-only onboarding checklist. `null` means "show
--    onboarding"; any timestamp means "done or dismissed" (the app treats
--    completion and dismissal identically - see app/(dashboard)/onboarding).
--    Existing/seeded agencies are backfilled to `created_at` so they never
--    see onboarding retroactively.
--
-- 2. `create_agency_with_owner(...)` - a SECURITY DEFINER RPC that replaces
--    the old client-side "insert agency, then insert profile, then insert
--    plan" signup sequence. That sequence ran on the anon/cookie-bound
--    session client and required an `authenticated` JWT for the `agencies`
--    insert; if the project has email confirmations enabled,
--    `supabase.auth.signUp()` returns a user with NO session, so that insert
--    ran as `anon` and hit RLS ("new row violates row-level security policy
--    for table agencies"). This function performs the whole bootstrap
--    (agency + owner profile + default commission plan/rates) as a single
--    atomic transaction, executed with the privileges of its owner (bypasses
--    RLS entirely, the same pattern already used by get_my_agency_id() /
--    get_my_role() below) - so it works identically regardless of whether a
--    browser session exists yet. It is only ever invoked server-side via the
--    service-role client (see lib/repositories/agencyRepository.ts), never
--    exposed to the browser, and EXECUTE is revoked from PUBLIC/anon/
--    authenticated and granted to service_role only.

alter table public.agencies
  add column if not exists onboarding_completed_at timestamptz;

update public.agencies
  set onboarding_completed_at = created_at
  where onboarding_completed_at is null;

-- Agencies previously had no UPDATE policy at all. Owners need one so they
-- can rename their agency and mark onboarding complete/dismissed from the
-- normal session-scoped client (not the admin client - this is a routine
-- Owner-initiated change, not a privileged bootstrap operation).
create policy "agencies_update_owner" on public.agencies
  for update using (
    id = public.get_my_agency_id() and public.get_my_role() = 'owner'
  );

-- Superseded by create_agency_with_owner() below: legitimate agency
-- creation now happens exclusively through that privileged, service-role
-- RPC. Leaving a blanket "any authenticated user may insert a bare agency
-- row" policy in place would be unused attack surface (it would let any
-- signed-in Manager/Agent in any tenant create an orphaned agency with no
-- owner), so it's removed rather than kept alongside the new path.
drop policy if exists "agencies_insert_authenticated" on public.agencies;

create or replace function public.create_agency_with_owner(
  p_auth_user_id uuid,
  p_agency_name text,
  p_first_name text,
  p_last_name text,
  p_email text
)
returns table (
  agency_id uuid,
  user_id uuid,
  commission_plan_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing_user public.users%rowtype;
  v_agency_id uuid;
  v_plan_id uuid;
begin
  if p_auth_user_id is null then
    raise exception 'Auth user id is required';
  end if;
  if p_agency_name is null or btrim(p_agency_name) = '' then
    raise exception 'Agency name is required';
  end if;
  if p_first_name is null or btrim(p_first_name) = '' then
    raise exception 'First name is required';
  end if;
  if p_last_name is null or btrim(p_last_name) = '' then
    raise exception 'Last name is required';
  end if;
  if p_email is null or btrim(p_email) = '' then
    raise exception 'Email is required';
  end if;

  -- Idempotency guard: a retried signup submission (e.g. a network retry
  -- after the client didn't see the first response) must never create a
  -- second agency for the same brand-new auth user. If a profile already
  -- exists for this auth id, just return their existing agency/plan.
  select * into v_existing_user from public.users where id = p_auth_user_id;
  if found then
    return query
      select
        v_existing_user.agency_id,
        v_existing_user.id,
        (
          select cp.id from public.commission_plans cp
          where cp.agency_id = v_existing_user.agency_id and cp.is_default
          limit 1
        );
    return;
  end if;

  insert into public.agencies (name)
  values (btrim(p_agency_name))
  returning id into v_agency_id;

  insert into public.users (id, agency_id, first_name, last_name, email, role)
  values (
    p_auth_user_id,
    v_agency_id,
    btrim(p_first_name),
    btrim(p_last_name),
    lower(btrim(p_email)),
    'owner'
  );

  insert into public.commission_plans (agency_id, name, active, is_default)
  values (v_agency_id, 'Standard Plan', true, true)
  returning id into v_plan_id;

  -- Mirrors the MVP-documented defaults (10% agent / 2% manager / 1% owner,
  -- same for new business and renewals) previously seeded client-side by
  -- createDefaultPlanForNewAgency().
  insert into public.commission_plan_rates (
    agency_id, commission_plan_id, role, business_type, percent
  )
  values
    (v_agency_id, v_plan_id, 'agent', 'new', 10),
    (v_agency_id, v_plan_id, 'agent', 'renewal', 10),
    (v_agency_id, v_plan_id, 'manager', 'new', 2),
    (v_agency_id, v_plan_id, 'manager', 'renewal', 2),
    (v_agency_id, v_plan_id, 'owner', 'new', 1),
    (v_agency_id, v_plan_id, 'owner', 'renewal', 1);

  return query select v_agency_id, p_auth_user_id, v_plan_id;
end;
$$;

-- Postgres grants EXECUTE to PUBLIC by default on function creation - revoke
-- that explicitly so anon/authenticated can never call this directly, then
-- grant only to service_role (the admin client is the sole caller).
revoke all on function public.create_agency_with_owner(uuid, text, text, text, text) from public;
grant execute on function public.create_agency_with_owner(uuid, text, text, text, text) to service_role;
