-- SYNTHETIC PROJECT ONLY: supabase_db_commissionflow-devoted-review, never the working database.
-- Requires migration 0012. The runner must explicitly SET readiness.synthetic_only='on'.
-- All identities and rows are fictional and rolled back, including on disconnect/error.
\set ON_ERROR_STOP on
do $$ begin
  if current_setting('readiness.synthetic_only',true) is distinct from 'on' then raise exception 'Synthetic-only readiness runner required'; end if;
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='users' and policyname='users_insert_owner_only') then raise exception 'Rehearse migration 0012 first'; end if;
end $$;
begin;
create function pg_temp.ready(ok boolean, label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'Readiness access failure: %',label; end if; end $$;
create function pg_temp.must_deny(sql text) returns void language plpgsql as $$
begin
  begin execute sql; exception when insufficient_privilege then return; end;
  raise exception 'Expected access denial';
end $$;
select pg_temp.ready(not has_function_privilege('anon','public.create_agency_with_owner(uuid,text,text,text,text)','EXECUTE'),'anonymous signup RPC denied');
select pg_temp.ready(not has_function_privilege('authenticated','public.create_agency_with_owner(uuid,text,text,text,text)','EXECUTE'),'authenticated signup RPC denied');
select pg_temp.ready(has_function_privilege('service_role','public.create_agency_with_owner(uuid,text,text,text,text)','EXECUTE'),'trusted signup RPC preserved');
insert into public.agencies(id,name) values
 ('ed230000-0000-4000-8000-000000000100','Synthetic Readiness RLS A'),
 ('ed230000-0000-4000-8000-000000000200','Synthetic Readiness RLS B');
insert into auth.users(id,email) values
 ('ed230000-0000-4000-8000-000000000001','ready-owner@synthetic.invalid'),
 ('ed230000-0000-4000-8000-000000000002','ready-agent@synthetic.invalid'),
 ('ed230000-0000-4000-8000-000000000003','ready-unprovisioned@synthetic.invalid');
insert into public.users(id,agency_id,first_name,last_name,email,role,agent_type,active) values
 ('ed230000-0000-4000-8000-000000000001','ed230000-0000-4000-8000-000000000100','Synthetic','Owner','ready-owner@synthetic.invalid','owner','independent',true),
 ('ed230000-0000-4000-8000-000000000002','ed230000-0000-4000-8000-000000000100','Synthetic','Agent','ready-agent@synthetic.invalid','agent','independent',true);
insert into public.commission_statements(id,agency_id,user_id,carrier,statement_month,source,file_hash) values
 ('ed230000-0000-4000-8000-000000000300','ed230000-0000-4000-8000-000000000100','ed230000-0000-4000-8000-000000000002','Synthetic Readiness','2026-01','upload',repeat('a',64));
insert into public.carrier_transactions(agency_id,statement_id,carrier,statement_month,carrier_member_id,effective_date,commission_type,amount_cents,transaction_key,user_id) values
 ('ed230000-0000-4000-8000-000000000100','ed230000-0000-4000-8000-000000000300','Synthetic Readiness','2026-01','SYNTH-READINESS','2026-01-01','RENEWAL',100,'synthetic-readiness-active-account','ed230000-0000-4000-8000-000000000002');

select set_config('request.jwt.claim.sub','ed230000-0000-4000-8000-000000000002',true);
set local role authenticated;
select pg_temp.ready((select count(*)=1 from public.carrier_transactions where carrier='Synthetic Readiness'),'active agent sees own entry');
reset role;
update public.users set active=false where id='ed230000-0000-4000-8000-000000000002';
set local role authenticated;
select pg_temp.ready(public.get_my_agency_id() is null and public.get_my_role() is null and not public.can_see_direct_reports(),'inactive authority removed');
select pg_temp.ready((select count(*)=0 from public.carrier_transactions),'inactive session has no financial row access');
select pg_temp.ready((select count(*)=0 from public.commission_statements),'inactive session has no statement access');
reset role;
do $$ begin raise notice 'PASS inactive sessions denied despite a valid auth subject'; end $$;

select set_config('request.jwt.claim.sub','ed230000-0000-4000-8000-000000000003',true);
set local role authenticated;
select pg_temp.must_deny($attempt$insert into public.users(id,agency_id,first_name,last_name,email,role,agent_type) values('ed230000-0000-4000-8000-000000000003','ed230000-0000-4000-8000-000000000100','Synthetic','Forbidden Owner','ready-unprovisioned@synthetic.invalid','owner','independent')$attempt$);
reset role;
do $$ begin raise notice 'PASS an unprovisioned login cannot choose another agency and become its owner'; end $$;

select set_config('request.jwt.claim.sub','ed230000-0000-4000-8000-000000000001',true);
set local role authenticated;
select pg_temp.must_deny($attempt$insert into public.users(id,agency_id,first_name,last_name,email,role,agent_type) values('ed230000-0000-4000-8000-000000000003','ed230000-0000-4000-8000-000000000200','Synthetic','Forbidden Other Agency','ready-unprovisioned@synthetic.invalid','agent','independent')$attempt$);
insert into public.users(id,agency_id,first_name,last_name,email,role,agent_type) values
 ('ed230000-0000-4000-8000-000000000003','ed230000-0000-4000-8000-000000000100','Synthetic','Allowed Teammate','ready-unprovisioned@synthetic.invalid','agent','independent');
select pg_temp.ready((select count(*)=1 from public.users where id='ed230000-0000-4000-8000-000000000003'),'active owner can still provision a teammate in own agency');
reset role;
do $$ begin raise notice 'PASS owner provisioning remains scoped to the owner agency'; end $$;
rollback;
do $$ begin
  if exists(select 1 from public.agencies where id in('ed230000-0000-4000-8000-000000000100','ed230000-0000-4000-8000-000000000200')) then raise exception 'Synthetic fixture rollback incomplete'; end if;
  raise notice 'PASS readiness access fixtures rolled back';
end $$;
