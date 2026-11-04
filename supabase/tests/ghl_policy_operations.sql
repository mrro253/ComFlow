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
select pg_temp.run('e0140000-0000-4000-8000-000000000001','prepare',pg_temp.payload());
select pg_temp.run('e0140000-0000-4000-8000-000000000001','prepare',pg_temp.payload()||'{"id":"e0140000-0000-4000-8000-000000000599"}');
select pg_temp.ok((select count(*)=1 from public.ghl_policy_operations),'same prepared review reuses one operation');
select pg_temp.denied($q$select pg_temp.run('e0140000-0000-4000-8000-000000000004','prepare',pg_temp.payload())$q$);
select pg_temp.denied($q$select pg_temp.run('e0140000-0000-4000-8000-000000000001','checkpoint','{"id":"e0140000-0000-4000-8000-000000000501","phase":"note_pending"}')$q$);
select pg_temp.run('e0140000-0000-4000-8000-000000000001','claim','{"id":"e0140000-0000-4000-8000-000000000501","leaseId":"e0140000-0000-4000-8000-000000000701"}');
select pg_temp.denied($q$select pg_temp.run('e0140000-0000-4000-8000-000000000001','claim','{"id":"e0140000-0000-4000-8000-000000000501","leaseId":"e0140000-0000-4000-8000-000000000702"}')$q$);
select pg_temp.denied($q$select pg_temp.run('e0140000-0000-4000-8000-000000000001','checkpoint','{"id":"e0140000-0000-4000-8000-000000000501","leaseId":"e0140000-0000-4000-8000-000000000701","phase":"field_pending"}')$q$);
select pg_temp.run('e0140000-0000-4000-8000-000000000001','checkpoint','{"id":"e0140000-0000-4000-8000-000000000501","leaseId":"e0140000-0000-4000-8000-000000000701","phase":"note_pending"}');
select pg_temp.run('e0140000-0000-4000-8000-000000000001','release','{"id":"e0140000-0000-4000-8000-000000000501","leaseId":"e0140000-0000-4000-8000-000000000701"}');
select pg_temp.run('e0140000-0000-4000-8000-000000000001','claim','{"id":"e0140000-0000-4000-8000-000000000501","leaseId":"e0140000-0000-4000-8000-000000000702"}');
select pg_temp.ok((select phase='note_pending' from public.ghl_policy_operations where id='e0140000-0000-4000-8000-000000000501'),'unknown note outcome survives recovery');
select pg_temp.denied($q$select pg_temp.run('e0140000-0000-4000-8000-000000000001','checkpoint','{"id":"e0140000-0000-4000-8000-000000000501","leaseId":"e0140000-0000-4000-8000-000000000701","phase":"note_confirmed","noteId":"SyntheticNote"}')$q$);
select pg_temp.denied($q$select pg_temp.run('e0140000-0000-4000-8000-000000000001','checkpoint','{"id":"e0140000-0000-4000-8000-000000000501","leaseId":"e0140000-0000-4000-8000-000000000702","phase":"prepared"}')$q$);
select pg_temp.run('e0140000-0000-4000-8000-000000000001','checkpoint','{"id":"e0140000-0000-4000-8000-000000000501","leaseId":"e0140000-0000-4000-8000-000000000702","phase":"note_confirmed","noteId":"SyntheticNote"}');
select pg_temp.run('e0140000-0000-4000-8000-000000000001','checkpoint','{"id":"e0140000-0000-4000-8000-000000000501","leaseId":"e0140000-0000-4000-8000-000000000702","phase":"field_pending"}');
select pg_temp.run('e0140000-0000-4000-8000-000000000001','checkpoint','{"id":"e0140000-0000-4000-8000-000000000501","leaseId":"e0140000-0000-4000-8000-000000000702","phase":"completed"}');
select pg_temp.ok((select count(*)=1 from public.audit_events where agency_id='e0140000-0000-4000-8000-000000000100' and action='ghl.policy_status_write_completed'),'one durable completion receipt');
select pg_temp.denied($q$select pg_temp.run('e0140000-0000-4000-8000-000000000001','checkpoint','{"id":"e0140000-0000-4000-8000-000000000501","leaseId":"e0140000-0000-4000-8000-000000000702","phase":"completed"}')$q$);
insert into public.audit_events(agency_id,actor_user_id,action,entity_type,entity_id,created_at,details) values('e0140000-0000-4000-8000-000000000100','e0140000-0000-4000-8000-000000000001','sunfire.sale_assigned','sunfire_collection',repeat('a',64),'2026-11-03 10:00Z','{"ownerId":"e0140000-0000-4000-8000-000000000001","enrollmentCode":"AGENT1","agentId":"e0140000-0000-4000-8000-000000000002"}');
select pg_temp.run('e0140000-0000-4000-8000-000000000002','prepare',pg_temp.payload()||'{"id":"e0140000-0000-4000-8000-000000000503","contactId":"SyntheticContact3","code":"AGENT1","ghlUserId":"SyntheticAgent"}');
insert into public.audit_events(agency_id,actor_user_id,action,entity_type,entity_id,created_at,details) values('e0140000-0000-4000-8000-000000000100','e0140000-0000-4000-8000-000000000001','sunfire.sale_assigned','sunfire_collection',repeat('a',64),'2026-11-03 11:00Z','{"ownerId":"e0140000-0000-4000-8000-000000000001","enrollmentCode":"AGENT1","agentId":null}');
select pg_temp.denied($q$select pg_temp.run('e0140000-0000-4000-8000-000000000002','claim','{"id":"e0140000-0000-4000-8000-000000000503","leaseId":"e0140000-0000-4000-8000-000000000703"}')$q$);
select pg_temp.denied($q$select pg_temp.run('e0140000-0000-4000-8000-000000000001','claim','{"id":"e0140000-0000-4000-8000-000000000503","leaseId":"e0140000-0000-4000-8000-000000000703"}')$q$);
select pg_temp.run('e0140000-0000-4000-8000-000000000001','prepare',pg_temp.payload()||'{"id":"e0140000-0000-4000-8000-000000000504","contactId":"SyntheticContact4","code":"APP4"}');
select pg_temp.run('e0140000-0000-4000-8000-000000000001','claim','{"id":"e0140000-0000-4000-8000-000000000504","leaseId":"e0140000-0000-4000-8000-000000000706"}');
update public.ghl_policy_operations set lease_until=now()-interval '1 second' where id='e0140000-0000-4000-8000-000000000504';
select pg_temp.run('e0140000-0000-4000-8000-000000000001','claim','{"id":"e0140000-0000-4000-8000-000000000504","leaseId":"e0140000-0000-4000-8000-000000000707"}');
select pg_temp.denied($q$select pg_temp.run('e0140000-0000-4000-8000-000000000001','checkpoint','{"id":"e0140000-0000-4000-8000-000000000504","leaseId":"e0140000-0000-4000-8000-000000000706","phase":"note_pending"}')$q$);
select pg_temp.denied($q$select pg_temp.run('e0140000-0000-4000-8000-000000000001','prepare',pg_temp.payload()||jsonb_build_object('contactId','SyntheticContact4','code','APP4','reviewHash',repeat('e',64)))$q$);
-- Details use the same private journal, with one pending operation per contact.
select pg_temp.run('e0140000-0000-4000-8000-000000000001','prepare',pg_temp.payload()||'{"id":"e0140000-0000-4000-8000-000000000510","contactId":"SyntheticDetails","fieldId":"PolicyDetails","payload":{"kind":"details","changes":[{"key":"plan","fieldId":"SyntheticPlan","label":"Medicare policy name","previous":"Old synthetic plan","target":"New synthetic plan"}]}}');
select pg_temp.ok((select payload->'changes'->0->>'previous'='Old synthetic plan' from public.ghl_policy_operations where id='e0140000-0000-4000-8000-000000000510'),'details preserve original reviewed value');
select pg_temp.run('e0140000-0000-4000-8000-000000000001','claim','{"id":"e0140000-0000-4000-8000-000000000510","leaseId":"e0140000-0000-4000-8000-000000000710"}');
select pg_temp.denied($q$select pg_temp.run('e0140000-0000-4000-8000-000000000001','prepare',pg_temp.payload()||jsonb_build_object('contactId','SyntheticDetails','reviewHash',repeat('e',64)))$q$);
select pg_temp.run('e0140000-0000-4000-8000-000000000001','checkpoint','{"id":"e0140000-0000-4000-8000-000000000510","leaseId":"e0140000-0000-4000-8000-000000000710","phase":"note_pending"}');
select pg_temp.run('e0140000-0000-4000-8000-000000000001','checkpoint','{"id":"e0140000-0000-4000-8000-000000000510","leaseId":"e0140000-0000-4000-8000-000000000710","phase":"note_confirmed","noteId":"SyntheticDetailsNote"}');
select pg_temp.run('e0140000-0000-4000-8000-000000000001','checkpoint','{"id":"e0140000-0000-4000-8000-000000000510","leaseId":"e0140000-0000-4000-8000-000000000710","phase":"completed"}');
select pg_temp.ok((select count(*)=1 from public.audit_events where agency_id='e0140000-0000-4000-8000-000000000100' and action='ghl.policy_details_write_completed'),'details receive a separate completion receipt');
select pg_temp.denied($q$select pg_temp.run('e0140000-0000-4000-8000-000000000001','prepare',pg_temp.payload()||'{"fieldId":"PolicyDetails"}')$q$);
select pg_temp.denied($q$select pg_temp.run('e0140000-0000-4000-8000-000000000001','prepare',pg_temp.payload()||'{"fieldId":"PolicyDetails","payload":{"kind":"details","changes":[{"key":"mbi","fieldId":"SyntheticMbi","previous":null,"target":"forbidden"}]}}')$q$);
update public.users set active=false where id='e0140000-0000-4000-8000-000000000001';
select pg_temp.denied($q$select pg_temp.run('e0140000-0000-4000-8000-000000000001','prepare',pg_temp.payload())$q$);
rollback;
do $$ begin raise notice 'PASS journal permissions, prepared deduplication, lease exclusion, history ordering, unknown-outcome recovery, stale-lease denial, completion receipts and revoked/cross-account access; fixtures rolled back';end $$;
