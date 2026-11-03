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

insert into public.commission_statements(id,agency_id,user_id,carrier,statement_month,source,file_hash,status) values('e0180000-0000-4000-8000-000000000301','e0140000-0000-4000-8000-000000000100','e0140000-0000-4000-8000-000000000001','Synthetic','2026-03','upload',repeat('a',64),'imported');
insert into public.carrier_transactions(id,agency_id,statement_id,carrier,statement_month,carrier_member_id,effective_date,commission_type,amount_cents,transaction_key,user_id) values('e0180000-0000-4000-8000-000000000401','e0140000-0000-4000-8000-000000000100','e0180000-0000-4000-8000-000000000301','Synthetic','2026-03','SYNTHETIC','2026-03-01','COMMISSION',100,'synthetic-contact','e0140000-0000-4000-8000-000000000001');
select pg_temp.ok(not has_table_privilege('authenticated','public.ghl_statement_contact_operations','SELECT') and not has_table_privilege('authenticated','public.ghl_statement_contact_links','INSERT'),'browser cannot access contact journal');
insert into public.ghl_statement_contact_operations(id,agency_id,actor_user_id,connection_id,ghl_user_id,source_entry_id,identity_hash) values('e0180000-0000-4000-8000-000000000501','e0140000-0000-4000-8000-000000000100','e0140000-0000-4000-8000-000000000001','e0140000-0000-4000-8000-000000000303','SyntheticOwner','e0180000-0000-4000-8000-000000000401',repeat('b',64));
select pg_temp.denied($q$update public.ghl_statement_contact_operations set actor_user_id='e0140000-0000-4000-8000-000000000002' where id='e0180000-0000-4000-8000-000000000501'$q$);
update public.ghl_statement_contact_operations set phase='create_pending' where id='e0180000-0000-4000-8000-000000000501';
select pg_temp.denied($q$update public.ghl_statement_contact_operations set phase='prepared' where id='e0180000-0000-4000-8000-000000000501'$q$);
update public.ghl_statement_contact_operations set phase='created',contact_id='SyntheticContact' where id='e0180000-0000-4000-8000-000000000501';
insert into public.ghl_statement_contact_links(id,agency_id,actor_user_id,connection_id,ghl_user_id,source_entry_id,source_key,contact_id,operation_id) values('e0180000-0000-4000-8000-000000000601','e0140000-0000-4000-8000-000000000100','e0140000-0000-4000-8000-000000000001','e0140000-0000-4000-8000-000000000303','SyntheticOwner','e0180000-0000-4000-8000-000000000401',repeat('c',64),'SyntheticContact','e0180000-0000-4000-8000-000000000501');
select pg_temp.denied($q$update public.ghl_statement_contact_links set contact_id='OtherContact' where id='e0180000-0000-4000-8000-000000000601'$q$);
select pg_temp.denied($q$update public.ghl_statement_contact_operations set contact_id='OtherContact' where id='e0180000-0000-4000-8000-000000000501'$q$);
update public.carrier_transactions set user_id='e0140000-0000-4000-8000-000000000002' where id='e0180000-0000-4000-8000-000000000401';
select pg_temp.denied($q$update public.ghl_statement_contact_operations set phase='linked' where id='e0180000-0000-4000-8000-000000000501'$q$);
rollback;
do $$begin raise notice 'PASS private provisioning journal, immutable contact links, monotonic creation phases and revoked source assignment';end$$;
