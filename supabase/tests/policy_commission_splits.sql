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

insert into auth.users(id,email) values('e0140000-0000-4000-8000-000000000003','write-agent2@synthetic.invalid');
insert into public.users(id,agency_id,email,first_name,last_name,role,agent_type,active) values('e0140000-0000-4000-8000-000000000003','e0140000-0000-4000-8000-000000000100','write-agent2@synthetic.invalid','Synthetic','Agent2','agent','independent',true);
select public.manage_ghl_connection('e0140000-0000-4000-8000-000000000001','e0140000-0000-4000-8000-000000000100','map','{"id":"e0140000-0000-4000-8000-000000000303","userId":"e0140000-0000-4000-8000-000000000003","ghlUserId":"SyntheticAgent2"}');

select pg_temp.ok(not has_function_privilege('authenticated','public.save_policy_commission_owner(uuid,uuid,uuid,uuid,text,text)','EXECUTE') and not has_table_privilege('authenticated','public.policy_commission_owners','SELECT'),'no browser ownership privileges');
insert into public.production_entities(id,agency_id,name,entity_type,user_id) values
('e0190000-0000-4000-8000-000000000901','e0140000-0000-4000-8000-000000000100','Synthetic personal','personal','e0140000-0000-4000-8000-000000000001'),
('e0190000-0000-4000-8000-000000000902','e0140000-0000-4000-8000-000000000100','Synthetic agency','agency',null);
insert into public.commission_statements(id,agency_id,user_id,carrier,statement_month,source,file_hash,status) values('e0190000-0000-4000-8000-000000000301','e0140000-0000-4000-8000-000000000100',null,'Synthetic','2026-03','upload',repeat('a',64),'imported');
insert into public.carrier_transactions(id,agency_id,statement_id,carrier,statement_month,carrier_member_id,effective_date,commission_type,amount_cents,transaction_key,user_id,writing_agent_name,writing_agent_verified) values
('e0190000-0000-4000-8000-000000000401','e0140000-0000-4000-8000-000000000100','e0190000-0000-4000-8000-000000000301','Synthetic','2026-03','MEMBER1','2026-03-01','COMMISSION',101,'owner-original-1','e0140000-0000-4000-8000-000000000001','WRITER ONE',true),
('e0190000-0000-4000-8000-000000000402','e0140000-0000-4000-8000-000000000100','e0190000-0000-4000-8000-000000000301','Synthetic','2026-04','MEMBER1','2026-03-01','CHARGEBACK',-101,'owner-original-2','e0140000-0000-4000-8000-000000000001','WRITER ONE',true),
('e0190000-0000-4000-8000-000000000403','e0140000-0000-4000-8000-000000000100','e0190000-0000-4000-8000-000000000301','Synthetic','2026-04','MEMBER1','2026-04-01','COMMISSION',200,'owner-other-policy','e0140000-0000-4000-8000-000000000001','WRITER ONE',true),
('e0190000-0000-4000-8000-000000000404','e0140000-0000-4000-8000-000000000100','e0190000-0000-4000-8000-000000000301','Other carrier','2026-03','MEMBER1','2026-03-01','COMMISSION',300,'owner-other-carrier','e0140000-0000-4000-8000-000000000001','WRITER ONE',true);

create function pg_temp.review_hash() returns text language sql as $$ select public.review_policy_commission_owner('e0140000-0000-4000-8000-000000000001','e0140000-0000-4000-8000-000000000100','e0190000-0000-4000-8000-000000000401')->>'reviewHash' $$;
create temp table old_preview as select pg_temp.review_hash() h;
select pg_temp.ok(not has_function_privilege('authenticated','public.save_policy_commission_split(uuid,uuid,uuid,uuid,uuid,integer,boolean,text,text)','execute'),'split is server only');
select public.save_policy_commission_split('e0140000-0000-4000-8000-000000000001','e0140000-0000-4000-8000-000000000100','e0190000-0000-4000-8000-000000000401','e0140000-0000-4000-8000-000000000002','e0140000-0000-4000-8000-000000000003',5000,true,'Synthetic sharing agreement',pg_temp.review_hash());
select pg_temp.ok((select count(*)=4 from public.commission_allocations),'only two policy entries allocated');
select pg_temp.ok((select count(*)=2 from public.commission_allocations where user_id='e0140000-0000-4000-8000-000000000002' and abs(amount_cents)=51),'first receives mirrored half cent');
select pg_temp.ok((select count(*)=2 from public.commission_allocations where user_id='e0140000-0000-4000-8000-000000000003' and abs(amount_cents)=50),'second receives remainder');
select pg_temp.ok(not exists(select 1 from public.commission_allocations a join public.carrier_transactions t on t.id=a.transaction_id group by t.id,t.amount_cents having sum(a.amount_cents)<>t.amount_cents),'allocations reconcile to original');
select pg_temp.ok((select count(*)=4 from public.carrier_transactions where user_id='e0140000-0000-4000-8000-000000000001' and writing_agent_name='WRITER ONE'),'source ownership and printed writer unchanged');
select pg_temp.denied($q$select public.save_policy_commission_owner('e0140000-0000-4000-8000-000000000001','e0140000-0000-4000-8000-000000000100','e0190000-0000-4000-8000-000000000401','e0140000-0000-4000-8000-000000000002','Conflict',pg_temp.review_hash())$q$);
select pg_temp.denied($q$select public.save_policy_commission_split('e0140000-0000-4000-8000-000000000001','e0140000-0000-4000-8000-000000000100','e0190000-0000-4000-8000-000000000401','e0140000-0000-4000-8000-000000000002','e0140000-0000-4000-8000-000000000003',5000,true,'Stale',(select h from old_preview))$q$);
select pg_temp.denied($q$select public.save_policy_commission_split('e0140000-0000-4000-8000-000000000001','e0140000-0000-4000-8000-000000000100','e0190000-0000-4000-8000-000000000401','e0140000-0000-4000-8000-000000000002','e0140000-0000-4000-8000-000000000004',5000,true,'Foreign recipient',pg_temp.review_hash())$q$);
select pg_temp.denied($q$select public.save_policy_commission_split('e0140000-0000-4000-8000-000000000002','e0140000-0000-4000-8000-000000000100','e0190000-0000-4000-8000-000000000401','e0140000-0000-4000-8000-000000000002','e0140000-0000-4000-8000-000000000003',5000,true,'Agent unauthorized',pg_temp.review_hash())$q$);
insert into public.carrier_transactions(id,agency_id,statement_id,carrier,statement_month,carrier_member_id,effective_date,commission_type,amount_cents,transaction_key,user_id,writing_agent_name) values
('e0190000-0000-4000-8000-000000000405','e0140000-0000-4000-8000-000000000100','e0190000-0000-4000-8000-000000000301','Synthetic','2026-05','MEMBER1','2026-03-01','RENEWAL',99,'split-future','e0140000-0000-4000-8000-000000000001','WRITER ONE');
select pg_temp.ok((select count(*)=2 and sum(amount_cents)=99 from public.commission_allocations where transaction_id='e0190000-0000-4000-8000-000000000405'),'future imports allocate automatically');
select pg_temp.denied($q$insert into public.agent_earnings(agency_id,user_id,carrier_transaction_id,earned_amount_cents) values('e0140000-0000-4000-8000-000000000100','e0140000-0000-4000-8000-000000000001','e0190000-0000-4000-8000-000000000401',101)$q$);
set local role authenticated;
select set_config('request.jwt.claim.sub','e0140000-0000-4000-8000-000000000002',true);
select pg_temp.ok((select count(*)=3 and bool_and(user_id='e0140000-0000-4000-8000-000000000002') from public.commission_allocations),'recipient sees own shares only');
select pg_temp.ok((select count(*)=3 from public.carrier_transactions where carrier='Synthetic' and effective_date='2026-03-01'),'recipient can read original source');
select pg_temp.ok((select count(*)=3 from public.commission_split_entries),'recipient sees split markers');
select set_config('request.jwt.claim.sub','e0140000-0000-4000-8000-000000000004',true);
select pg_temp.ok((select count(*)=0 from public.commission_allocations),'foreign agency cannot read shares');
select pg_temp.ok((select count(*)=0 from public.commission_split_entries),'foreign agency cannot read markers');
select pg_temp.ok((select count(*)=0 from public.carrier_transactions where carrier='Synthetic'),'foreign agency cannot read source');
reset role;
select public.save_policy_commission_split('e0140000-0000-4000-8000-000000000001','e0140000-0000-4000-8000-000000000100','e0190000-0000-4000-8000-000000000401',null,null,null,false,'Remove agreement',pg_temp.review_hash());
select pg_temp.ok((select count(*)=0 from public.commission_allocations),'removal clears active shares');
select pg_temp.ok((select count(*)=0 from public.commission_split_entries),'removal clears markers');
select pg_temp.ok((select count(*)=5 from public.carrier_transactions where user_id='e0140000-0000-4000-8000-000000000001'),'source records preserved');
insert into public.agent_earnings(agency_id,user_id,carrier_transaction_id,earned_amount_cents) values('e0140000-0000-4000-8000-000000000100','e0140000-0000-4000-8000-000000000001','e0190000-0000-4000-8000-000000000401',101);
select pg_temp.denied($q$select public.save_policy_commission_split('e0140000-0000-4000-8000-000000000001','e0140000-0000-4000-8000-000000000100','e0190000-0000-4000-8000-000000000401','e0140000-0000-4000-8000-000000000002','e0140000-0000-4000-8000-000000000003',5000,true,'Locked earnings',pg_temp.review_hash())$q$);
rollback;
