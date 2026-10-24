-- Readiness access fixes. Rehearse on the isolated project; do not apply to the
-- working project until this review branch's database change is approved.
-- No statement, commission, user classification or assignment data is updated.
create or replace function public.get_my_agency_id()
returns uuid language sql security definer set search_path = public stable as $$
  select agency_id from public.users where id = auth.uid() and active = true;
$$;

create or replace function public.get_my_role()
returns text language sql security definer set search_path = public stable as $$
  select role from public.users where id = auth.uid() and active = true;
$$;

create or replace function public.can_see_direct_reports()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((
    select u.role = 'manager' or coalesce(cl.visibility = 'direct_reports', false)
    from public.users u
    left join public.career_levels cl on cl.agency_id = u.agency_id and cl.name = u.career_level
    where u.id = auth.uid() and u.active = true
  ), false);
$$;

-- Signup already provisions an agency/profile through the service-role-only
-- create_agency_with_owner RPC. A browser must not choose its own tenant/role.
drop policy if exists "users_insert_self_or_owner" on public.users;
drop policy if exists "users_insert_owner_only" on public.users;
create policy "users_insert_owner_only" on public.users
for insert to authenticated with check (
  public.get_my_role() = 'owner' and agency_id = public.get_my_agency_id()
);

-- Supabase default function privileges may include explicit grants to anon and
-- authenticated. Revoking PUBLIC alone (as in 0004) does not remove those.
revoke all on function public.create_agency_with_owner(uuid,text,text,text,text) from public,anon,authenticated;
grant execute on function public.create_agency_with_owner(uuid,text,text,text,text) to service_role;
