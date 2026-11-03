-- Isolated synthetic runtime only. All fixtures, operations and receipts roll back.
\set ON_ERROR_STOP on
do $$ begin if current_setting('readiness.synthetic_only',true) is distinct from 'on' then raise exception 'Synthetic-only runner required'; end if; end $$;
begin;
create function pg_temp.ok(value boolean,label text) returns void language plpgsql as $$ begin if value is distinct from true then raise exception 'GHL journal failure: %',label; end if; end $$;
create function pg_temp.denied(statement text) returns void language plpgsql as $$ begin begin execute statement;exception when others then return;end;raise exception 'Expected journal rejection';end $$;
create function pg_temp.payload() returns jsonb language sql as $$select jsonb_build_object('id','e0140000-0000-4000-8000-000000000501','connectionId','e0140000-0000-4000-8000-000000000303','locationId','SyntheticLocation','ghlUserId','SyntheticOwner','contactId','SyntheticContact1','fieldId','SyntheticStatus','ownerId','e0140000-0000-4000-8000-000000000001','sourceHash',repeat('a',64),'code','APP1','sourceFingerprint',repeat('b',64),'statementMonth','2026-03','reviewHash',repeat('c',64),'snapshotHash',repeat('d',64),'previousStatus','Unknown')$$;
create function pg_temp.run(actor uuid,action text,data jsonb) returns void language plpgsql as $$ begin perform public.manage_ghl_policy_operation(actor,'e0140000-0000-4000-8000-000000000100',action,data);end $$;
insert into public.agencies(id,name) values('e0140000-0000-4000-8000-000000000100','Synthetic write A'),('e0140000-0000-4000-8000-000000000200','Synthetic write B');
insert into auth.users(id,email) values('e0140000-0000-4000-8000-000000000001','write-owner@synthetic.invalid'),('e0140000-0000-4000-8000-000000000002','write-agent@synthetic.invalid'),('e0140000-0000-4000-8000-000000000004','write-foreign@synthetic.invalid');
insert into public.users(id,agency_id,email,first_name,last_name,role,agent_type,active) values
 ('e0140000-0000-4000-8000-000000000001','e0140000-0000-4000-8000-000000000100','write-owner@synthetic.invalid','Synthetic','Owner','owner','independent',true),
 ('e0140000-0000-4000-8000-000000000002','e0140000-0000-4000-8000-000000000100','write-agent@synthetic.invalid','Synthetic','Agent','agent','independent',true),
 ('e0140000-0000-4000-8000-000000000004','e0140000-0000-4000-8000-000000000200','write-foreign@synthetic.invalid','Synthetic','Foreign','owner','independent',true);
select public.manage_ghl_connection('e0140000-0000-4000-8000-000000000001','e0140000-0000-4000-8000-000000000100','save','{"id":"e0140000-0000-4000-8000-000000000303","mode":"shared","locationId":"SyntheticLocation","locationName":"Synthetic location","ciphertext":"v1.synthetic"}');
select public.manage_ghl_connection('e0140000-0000-4000-8000-000000000001','e0140000-0000-4000-8000-000000000100','map','{"id":"e0140000-0000-4000-8000-000000000303","userId":"e0140000-0000-4000-8000-000000000001","ghlUserId":"SyntheticOwner"}');
select public.manage_ghl_connection('e0140000-0000-4000-8000-000000000001','e0140000-0000-4000-8000-000000000100','map','{"id":"e0140000-0000-4000-8000-000000000303","userId":"e0140000-0000-4000-8000-000000000002","ghlUserId":"SyntheticAgent"}');
select pg_temp.ok(not has_table_privilege('authenticated','public.ghl_policy_operations','SELECT') and not has_table_privilege('authenticated','public.ghl_policy_operations','INSERT'),'no browser journal access');
select pg_temp.ok(not has_function_privilege('authenticated','public.manage_ghl_policy_operation(uuid,uuid,text,jsonb)','EXECUTE') and not has_function_privilege('anon','public.manage_ghl_policy_operation(uuid,uuid,text,jsonb)','EXECUTE'),'no browser operation RPC');


select pg_temp.ok(not has_table_privilege('authenticated','public.ghl_import_jobs','INSERT') and not has_function_privilege('authenticated','public.claim_ghl_import_job(uuid,uuid)','EXECUTE'),'no browser queue or claim access');
insert into public.ghl_import_automation_settings(agency_id,actor_user_id,connection_id,enabled) values('e0140000-0000-4000-8000-000000000100','e0140000-0000-4000-8000-000000000001','e0140000-0000-4000-8000-000000000303',true);
select pg_temp.ok((select count(*)=0 from public.ghl_import_jobs),'enabling does not queue old statements');
insert into public.commission_statements(id,agency_id,user_id,carrier,statement_month,source,file_hash) values('e0190000-0000-4000-8000-000000000301','e0140000-0000-4000-8000-000000000100','e0140000-0000-4000-8000-000000000001','Synthetic','2026-03','upload',repeat('a',64));
insert into public.carrier_transactions(id,agency_id,statement_id,carrier,statement_month,carrier_member_id,effective_date,commission_type,amount_cents,transaction_key,user_id) values('e0190000-0000-4000-8000-000000000401','e0140000-0000-4000-8000-000000000100','e0190000-0000-4000-8000-000000000301','Synthetic','2026-03','SYNTHETIC','2026-03-01','COMMISSION',100,'synthetic-auto','e0140000-0000-4000-8000-000000000001');
update public.commission_statements set status='imported' where id='e0190000-0000-4000-8000-000000000301';
select pg_temp.ok((select count(*)=1 from public.ghl_import_jobs),'import queues exactly one job');
update public.commission_statements set status='imported' where id='e0190000-0000-4000-8000-000000000301';
select pg_temp.ok((select count(*)=1 from public.ghl_import_jobs),'repeat import status creates no duplicate job');
select public.claim_ghl_import_job((select id from public.ghl_import_jobs),'e0190000-0000-4000-8000-000000000701');
select pg_temp.ok((select state='running' and attempts=1 from public.ghl_import_jobs),'job claimed');
select pg_temp.ok(public.claim_ghl_import_job((select id from public.ghl_import_jobs),'e0190000-0000-4000-8000-000000000702') is null,'live lease cannot be claimed twice');
update public.ghl_import_jobs set lease_until=now()-interval '1 second';
select public.claim_ghl_import_job((select id from public.ghl_import_jobs),'e0190000-0000-4000-8000-000000000702');
select pg_temp.ok((select attempts=2 and lease_id='e0190000-0000-4000-8000-000000000702' from public.ghl_import_jobs),'expired job recovers with a fresh lease');
savepoint import_rollback;
insert into public.commission_statements(id,agency_id,user_id,carrier,statement_month,source,file_hash) values('e0190000-0000-4000-8000-000000000302','e0140000-0000-4000-8000-000000000100','e0140000-0000-4000-8000-000000000001','Synthetic','2026-04','upload',repeat('b',64));
insert into public.carrier_transactions(agency_id,statement_id,carrier,statement_month,carrier_member_id,effective_date,commission_type,amount_cents,transaction_key,user_id) values('e0140000-0000-4000-8000-000000000100','e0190000-0000-4000-8000-000000000302','Synthetic','2026-04','SYNTHETIC','2026-03-01','RENEWAL',100,'synthetic-auto-2','e0140000-0000-4000-8000-000000000001');
update public.commission_statements set status='imported' where id='e0190000-0000-4000-8000-000000000302';
select pg_temp.ok((select count(*)=2 from public.ghl_import_jobs),'second import gets its own job');
select pg_temp.ok(public.claim_ghl_import_job((select id from public.ghl_import_jobs where statement_id='e0190000-0000-4000-8000-000000000302'),'e0190000-0000-4000-8000-000000000703') is null,'same actor/location jobs cannot overlap');
rollback to savepoint import_rollback;
select pg_temp.ok((select count(*)=1 from public.ghl_import_jobs),'rolled back import leaves no queued work');
update public.ghl_import_jobs set state='queued',lease_id=null,lease_until=null;
update public.commission_statements set superseded_at=now(),status='superseded' where id='e0190000-0000-4000-8000-000000000301';
select public.claim_ghl_import_job((select id from public.ghl_import_jobs),'e0190000-0000-4000-8000-000000000704');
select pg_temp.ok((select state='cancelled' from public.ghl_import_jobs),'superseded source cannot start GHL writes');
rollback;
do $$begin raise notice 'PASS import trigger, idempotency, rollback, serialization, lease recovery and superseded-source denial';end$$;
