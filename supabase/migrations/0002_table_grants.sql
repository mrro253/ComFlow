-- Supabase roles need table-level GRANTs before RLS policies can take
-- effect. Without these, authenticated users hit "permission denied"
-- when the app queries public.users (e.g. getCurrentUser on /dashboard).

grant usage on schema public to anon, authenticated, service_role;

grant select, insert, update, delete on all tables in schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to service_role;

-- anon only needs read access for unauthenticated flows (MVP keeps this
-- minimal; most reads happen after sign-in as `authenticated`).
grant select on all tables in schema public to anon;

-- Auto-grant on tables created by future migrations in this schema.
alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;

alter default privileges in schema public
  grant select, insert, update, delete on tables to service_role;

alter default privileges in schema public
  grant select on tables to anon;
