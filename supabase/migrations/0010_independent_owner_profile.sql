-- Independent agents can optionally have an owner-level profile: they upload
-- and approve statements attributed to themselves (their own book). They never
-- see another teammate's statements. The flag is only valid on Independents.

alter table public.users
  add column if not exists independent_owner boolean not null default false;

alter table public.users drop constraint if exists users_independent_owner_matches_type;
alter table public.users
  add constraint users_independent_owner_matches_type
  check (independent_owner = false or agent_type = 'independent');
