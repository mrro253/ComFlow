-- Synthetic database only. Everything including audit events rolls back.
\set ON_ERROR_STOP on
do $$ begin if current_setting('readiness.synthetic_only',true) is distinct from 'on' then raise exception 'Synthetic-only runner required'; end if; end $$;
begin;
create function pg_temp.check_true(ok boolean,label text) returns void language plpgsql as $$ begin if ok is distinct from true then raise exception 'GHL setup failure: %',label; end if; end $$;
create function pg_temp.must_fail(statement text) returns void language plpgsql as $$ begin begin execute statement;exception when others then return;end;raise exception 'Expected setup rejection';end $$;
insert into public.agencies(id,name) values('e0130000-0000-4000-8000-000000000100','Synthetic GHL A'),('e0130000-0000-4000-8000-000000000200','Synthetic GHL B');
insert into auth.users(id,email) values
 ('e0130000-0000-4000-8000-000000000001','ghl-owner@synthetic.invalid'),('e0130000-0000-4000-8000-000000000002','ghl-agent@synthetic.invalid'),('e0130000-0000-4000-8000-000000000003','ghl-other@synthetic.invalid'),('e0130000-0000-4000-8000-000000000004','ghl-foreign@synthetic.invalid');
insert into public.users(id,agency_id,email,first_name,last_name,role,agent_type,active) values
 ('e0130000-0000-4000-8000-000000000001','e0130000-0000-4000-8000-000000000100','ghl-owner@synthetic.invalid','Synthetic','Owner','owner','independent',true),
 ('e0130000-0000-4000-8000-000000000002','e0130000-0000-4000-8000-000000000100','ghl-agent@synthetic.invalid','Synthetic','Agent','agent','independent',true),
 ('e0130000-0000-4000-8000-000000000003','e0130000-0000-4000-8000-000000000100','ghl-other@synthetic.invalid','Synthetic','Other','agent','independent',true),
 ('e0130000-0000-4000-8000-000000000004','e0130000-0000-4000-8000-000000000200','ghl-foreign@synthetic.invalid','Synthetic','Foreign','owner','independent',true);
select public.manage_ghl_connection('e0130000-0000-4000-8000-000000000002','e0130000-0000-4000-8000-000000000100','save','{"id":"e0130000-0000-4000-8000-000000000301","mode":"personal","locationId":"SyntheticPersonal","locationName":"Fictional personal","ciphertext":"v1.synthetic"}');
select public.manage_ghl_connection('e0130000-0000-4000-8000-000000000003','e0130000-0000-4000-8000-000000000100','save','{"id":"e0130000-0000-4000-8000-000000000302","mode":"personal","locationId":"SyntheticOther","locationName":"Fictional other","ciphertext":"v1.synthetic"}');
select public.manage_ghl_connection('e0130000-0000-4000-8000-000000000001','e0130000-0000-4000-8000-000000000100','save','{"id":"e0130000-0000-4000-8000-000000000303","mode":"shared","locationId":"SyntheticShared","locationName":"Fictional shared","ciphertext":"v1.synthetic"}');
select public.manage_ghl_connection('e0130000-0000-4000-8000-000000000001','e0130000-0000-4000-8000-000000000100','map','{"id":"e0130000-0000-4000-8000-000000000303","userId":"e0130000-0000-4000-8000-000000000002","ghlUserId":"SyntheticGhlAgent"}');
select pg_temp.check_true(not has_table_privilege('authenticated','public.ghl_credentials','SELECT'),'ciphertext denied to browser');
select pg_temp.check_true(not has_table_privilege('anon','public.ghl_credentials','SELECT'),'ciphertext denied to anonymous role');
select pg_temp.check_true(not has_function_privilege('authenticated','public.manage_ghl_connection(uuid,uuid,text,jsonb)','EXECUTE') and not has_function_privilege('anon','public.manage_ghl_connection(uuid,uuid,text,jsonb)','EXECUTE'),'privileged setup RPC denied to browser');
select set_config('request.jwt.claim.sub','e0130000-0000-4000-8000-000000000002',true);
set local role authenticated;
select pg_temp.check_true((select count(*)=2 from public.ghl_connections),'agent sees own personal and mapped shared only');
select pg_temp.check_true((select count(*)=1 from public.ghl_agent_mappings),'agent sees own mapping only');
reset role;
select set_config('request.jwt.claim.sub','e0130000-0000-4000-8000-000000000001',true);
set local role authenticated;
select pg_temp.check_true((select count(*)=1 from public.ghl_connections),'owner sees shared setup but not other users personal connections');
reset role;
select set_config('request.jwt.claim.sub','e0130000-0000-4000-8000-000000000003',true);
set local role authenticated;
select pg_temp.check_true((select count(*)=1 from public.ghl_connections),'unmapped teammate sees only own personal');
select pg_temp.check_true((select count(*)=0 from public.ghl_agent_mappings),'no other mapping disclosure');
reset role;
select set_config('request.jwt.claim.sub','e0130000-0000-4000-8000-000000000004',true);
set local role authenticated;
select pg_temp.check_true((select count(*)=0 from public.ghl_connections),'cross-agency metadata denied');
reset role;
update public.users set active=false where id='e0130000-0000-4000-8000-000000000002';
select set_config('request.jwt.claim.sub','e0130000-0000-4000-8000-000000000002',true);
set local role authenticated;
select pg_temp.check_true((select count(*)=0 from public.ghl_connections),'inactive metadata denied');
reset role;
update public.users set active=true where id='e0130000-0000-4000-8000-000000000002';
select pg_temp.must_fail($q$select public.manage_ghl_connection('e0130000-0000-4000-8000-000000000002','e0130000-0000-4000-8000-000000000100','disconnect','{"id":"e0130000-0000-4000-8000-000000000302"}')$q$);
select pg_temp.must_fail($q$select public.manage_ghl_connection('e0130000-0000-4000-8000-000000000004','e0130000-0000-4000-8000-000000000100','disconnect','{"id":"e0130000-0000-4000-8000-000000000303"}')$q$);
select pg_temp.must_fail($q$select public.manage_ghl_connection('e0130000-0000-4000-8000-000000000002','e0130000-0000-4000-8000-000000000100','save','{"id":"e0130000-0000-4000-8000-000000000304","mode":"shared","locationId":"SyntheticShared","locationName":"Not allowed","ciphertext":"v1.synthetic"}')$q$);
select pg_temp.must_fail($q$select public.manage_ghl_connection('e0130000-0000-4000-8000-000000000001','e0130000-0000-4000-8000-000000000100','map','{"id":"e0130000-0000-4000-8000-000000000303","userId":"e0130000-0000-4000-8000-000000000003","ghlUserId":"SyntheticGhlAgent"}')$q$);
select pg_temp.must_fail($q$select public.manage_ghl_connection('e0130000-0000-4000-8000-000000000002','e0130000-0000-4000-8000-000000000100','save','{"id":"e0130000-0000-4000-8000-000000000305","mode":"personal","locationId":"SyntheticBroken","locationName":"Broken replacement"}')$q$);
select pg_temp.check_true(exists(select 1 from public.ghl_connections where id='e0130000-0000-4000-8000-000000000301') and exists(select 1 from public.ghl_credentials where connection_id='e0130000-0000-4000-8000-000000000301'),'failed replacement preserves old credential atomically');
select public.manage_ghl_connection('e0130000-0000-4000-8000-000000000002','e0130000-0000-4000-8000-000000000100','disconnect','{"id":"e0130000-0000-4000-8000-000000000301"}');
select pg_temp.check_true(not exists(select 1 from public.ghl_credentials where connection_id='e0130000-0000-4000-8000-000000000301'),'disconnect deletes encrypted secret');
rollback;
do $$ begin raise notice 'PASS GHL personal/shared RLS, secret denial, privileged RPC, ownership, mapping uniqueness, atomic replacement and disconnect; fixtures rolled back';end $$;
