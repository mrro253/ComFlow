-- Synthetic-only rollback regression. Run ONLY against the isolated review database after 0011.
\set ON_ERROR_STOP on
begin;
select set_config('devoted_test.source_count',(select count(*)::text from public.commission_statement_sources),true);
create function pg_temp.assert(ok boolean, message text) returns void language plpgsql as $$ begin if ok is distinct from true then raise exception 'Assertion: %',message; end if; end $$;
create function pg_temp.reject(sql text, expected text) returns void language plpgsql as $$
begin
 begin execute sql; exception when others then
  if position(expected in sqlerrm)>0 then return; end if;
  raise;
 end;
 raise exception 'Expected rejection: %',expected;
end $$;
create function pg_temp.test_import(pdf text, workbook text, paydate date, expected uuid[] default '{}', replaces uuid[] default '{}', actor uuid default null, amount bigint default 2891, size integer default 100)
returns uuid language plpgsql as $$
declare agency uuid; owner_id uuid; pair text; row jsonb;
begin
 select agency_id,id into agency,owner_id from public.users where email='owner@commissionflow.dev';
 pair:=encode(digest(convert_to('["devoted-pair-v1","'||pdf||'","'||workbook||'"]','UTF8'),'sha256'),'hex');
 row:=jsonb_build_object('carrier','Devoted Health','statement_month',to_char(paydate,'YYYY-MM'),'carrier_member_id','SYNTH-M001','effective_date','2026-01-01','commission_type','RENEWAL','amount_cents',amount,'transaction_key',encode(digest(pair||':row','sha256'),'hex'),'writing_agent_name','ALEX SYNTHETIC','writing_agent_verified',true,'user_id',null,'production_entity_id',null,'writing_user_id',null);
 return public.import_devoted_pair(agency,coalesce(actor,owner_id),pdf,workbook,pair,size,100,paydate,repeat('e',64),paydate-7,paydate,amount,jsonb_build_array(row),expected,replaces,'devoted-pair-v1-single-renewal');
end $$;
do $$
declare first_id uuid; revised_id uuid; later_id uuid; old_count bigint; owner_id uuid; agency uuid; agent uuid; other_agency uuid := 'bb000000-0000-4000-8000-000000000001';
begin
 select agency_id,id into agency,owner_id from public.users where email='owner@commissionflow.dev';
 select id into agent from public.users where email='agent@commissionflow.dev';
 first_id:=pg_temp.test_import(repeat('a',64),repeat('b',64),'2026-09-25');
 perform pg_temp.assert((select count(*)=2 from public.commission_statement_sources where statement_id=first_id),'complete immutable pair');
 perform pg_temp.assert((select count(*)=1 and sum(amount_cents)=2891 from public.carrier_transactions where statement_id=first_id),'atomic commission insert');
 perform pg_temp.reject(format('select pg_temp.test_import(%L,%L,%L,%L::uuid[])',repeat('a',64),repeat('b',64),'2026-09-25',array[first_id]),'Explicit correction approval');
 perform pg_temp.reject(format('select pg_temp.test_import(%L,%L,%L)',repeat('a',64),repeat('c',64),'2026-09-25'),'Stale preview');
 perform pg_temp.reject(format('update public.commission_statement_sources set sha256=%L where statement_id=%L',repeat('f',64),first_id),'immutable');
 perform pg_temp.reject(format('delete from public.commission_statement_sources where statement_id=%L',first_id),'immutable');
 perform pg_temp.reject(format('update public.commission_statements set statement_pay_date=%L where id=%L','2026-09-26',first_id),'immutable');
 perform pg_temp.reject(format('select public.import_statement(%L,%L,%L,%L,2891,0,%L::jsonb)',agency,first_id,owner_id,'2026-09','[]'),'paired import');
 -- Same PDF with a changed workbook is a new correction, preserving the earlier rows.
 revised_id:=pg_temp.test_import(repeat('a',64),repeat('c',64),'2026-09-25',array[first_id],array[first_id]);
 perform pg_temp.assert((select status='superseded' and superseded_by=revised_id from public.commission_statements where id=first_id),'old source retained');
 perform pg_temp.assert((select count(*)=2 from public.carrier_transactions where statement_id in(first_id,revised_id)),'old ledger retained');
 -- Identical economics at a different verified pay date are two distinct receipts.
 later_id:=pg_temp.test_import(repeat('d',64),repeat('f',64),'2026-09-30');
 perform pg_temp.assert((select count(*)=2 and sum(amount_cents)=5782 from public.carrier_transactions where statement_id in(revised_id,later_id) and superseded_at is null),'separate same-month pay dates');
 select count(*) into old_count from public.commission_statements;
 perform pg_temp.reject(format('select pg_temp.test_import(%L,%L,%L,%L::uuid[],%L::uuid[],null,2891,0)',repeat('1',64),repeat('2',64),'2026-10-01','{}','{}'),'byte_size');
 perform pg_temp.assert((select count(*)=old_count from public.commission_statements),'failed source registration rolled back');
 perform pg_temp.reject(format('select pg_temp.test_import(%L,%L,%L,%L::uuid[],%L::uuid[],%L)',repeat('1',64),repeat('2',64),'2026-10-01','{}','{}',agent),'Owner required');
 perform pg_temp.assert(not has_function_privilege('authenticated','public.import_devoted_pair(uuid,uuid,text,text,text,integer,integer,date,text,date,date,bigint,jsonb,uuid[],uuid[],text)','EXECUTE'),'normal users cannot call import');
 perform pg_temp.assert(not has_function_privilege('service_role','public.import_pdf_statement_v1(uuid,uuid,uuid,text,bigint,bigint,jsonb,uuid[])','EXECUTE'),'private implementation cannot bypass paired guards');
 insert into public.agencies(id,name) values(other_agency,'Synthetic Other Agency');
 insert into public.commission_statements(id,agency_id,carrier,statement_month,source,file_hash) values('cc000000-0000-4000-8000-000000000001',agency,'Synthetic Single PDF','2026-09','upload',repeat('9',64));
 perform pg_temp.reject(format('select public.import_statement(%L,%L,%L,%L,2891,0,%L::jsonb)',agency,'cc000000-0000-4000-8000-000000000001',owner_id,'2026-09','[{"carrier":"Devoted Health"}]'),'paired import');
 perform public.import_statement(agency,'cc000000-0000-4000-8000-000000000001',owner_id,'2026-09',100,0,jsonb_build_array(jsonb_build_object('carrier','Synthetic Single PDF','statement_month','2026-09','carrier_member_id','SYNTH-LEGACY','effective_date','2026-01-01','commission_type','RENEWAL','amount_cents',100,'transaction_key','synthetic-legacy-key')));
 perform pg_temp.assert((select count(*)=1 and sum(amount_cents)=100 from public.carrier_transactions where carrier='Synthetic Single PDF'),'legacy single-PDF import preserved');
 perform pg_temp.reject(format('insert into public.commission_statement_sources(agency_id,statement_id,source_kind,storage_path,sha256,byte_size,media_type) values(%L,%L,%L,%L,%L,100,%L)',other_agency,'cc000000-0000-4000-8000-000000000001','pdf','synthetic-path',repeat('a',64),'application/pdf'),'foreign key');
 perform pg_temp.assert((select count(*)=0 from public.agent_earnings),'no automatic earnings');
end $$;
-- Role checks use existing synthetic seed identities. No personal source data is involved.
select set_config('request.jwt.claim.sub',(select id::text from public.users where email='owner@commissionflow.dev'),true);
set local role authenticated;
select pg_temp.assert((select count(*)=6+current_setting('devoted_test.source_count')::integer from public.commission_statement_sources),'owner sees paired metadata');
reset role;
select set_config('request.jwt.claim.sub',(select id::text from public.users where email='agent@commissionflow.dev'),true);
set local role authenticated;
select pg_temp.assert((select count(*)=0 from public.commission_statement_sources),'agent cannot read shared source metadata');
reset role;
rollback;
