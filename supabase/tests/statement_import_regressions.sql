-- SYNTHETIC DATABASE ONLY. Generate the complete input with scripts/make-import-regression-fixtures.ts.
-- The runner must target supabase_db_commissionflow-devoted-review, NEVER the working database.
\set ON_ERROR_STOP on
-- Additional refusal guard: the isolated review project contains only SYNTH-* seed entries.
do $$ begin
  if exists(select 1 from public.carrier_transactions where carrier_member_id not like 'SYNTH-%') then
    raise exception 'Refusing regression tests: this database contains non-synthetic carrier entries';
  end if;
end $$;
begin;
create function pg_temp.check_import(ok boolean, message text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'Import regression: %',message; end if; end $$;
create function pg_temp.reject_import(sql text, expected text) returns void language plpgsql as $$
begin
  begin execute sql; exception when others then
    if position(expected in sqlerrm)>0 then return; end if; raise;
  end;
  raise exception 'Expected rejection: %',expected;
end $$;
create function pg_temp.apply_import_case(item jsonb, version text, replaces uuid[] default '{}', expected uuid[] default '{}', override_rows jsonb default null)
returns uuid language plpgsql as $$
declare p jsonb:=item->version; rows jsonb:=coalesce(override_rows,p->'rows'); id uuid;
  agency uuid:='e7100000-0000-4000-8000-000000000100'; actor uuid:='e7100000-0000-4000-8000-000000000001'; pair jsonb:=p->'pair';
begin
  if item->>'carrier'='Devoted Health' then
    return public.import_devoted_pair(agency,actor,p->>'hash',pair->>'workbook',pair->>'hash',100,100,
      (pair->>'payDate')::date,pair->>'payee',(pair->>'start')::date,(pair->>'end')::date,(p->>'total')::bigint,
      rows,expected,replaces,pair->>'parser');
  end if;
  insert into public.commission_statements(agency_id,carrier,statement_month,source,original_filename,file_hash,uploaded_by)
    values(agency,item->>'carrier',p->>'month','upload','synthetic-repeat-correction.pdf',p->>'hash',actor) returning commission_statements.id into id;
  perform public.import_statement(agency,id,actor,p->>'month',(p->>'total')::bigint,(p->>'balance')::bigint,rows,replaces);
  return id;
end $$;
do $$
declare
  agency uuid:='e7100000-0000-4000-8000-000000000100'; actor uuid:='e7100000-0000-4000-8000-000000000001';
  cases jsonb:=current_setting('statement_regression.cases')::jsonb; item jsonb; first_id uuid; corrected_id uuid;
  original_count integer; parent_count integer; source_count integer; audit_count integer; bad_rows jsonb; expected_error text;
begin
  perform pg_temp.check_import(jsonb_array_length(cases)=3,'exactly three synthetic carrier cases required');
  perform pg_temp.check_import(not exists(select 1 from public.agencies where id=agency),'fixture agency must not already exist');
  insert into public.agencies(id,name) values(agency,'Synthetic Import Regression Agency');
  insert into auth.users(id,email) values(actor,'import-regression@synthetic.invalid');
  insert into public.users(id,agency_id,first_name,last_name,email,role,agent_type)
    values(actor,agency,'Synthetic','Import Owner','import-regression@synthetic.invalid','owner','independent');
  insert into public.production_entities(id,agency_id,name,entity_type,user_id)
    values('e7100000-0000-4000-8000-000000000200',agency,'Synthetic personal production','personal',actor);
  for item in select value from jsonb_array_elements(cases) loop
    original_count:=jsonb_array_length(item->'original'->'rows');
    first_id:=pg_temp.apply_import_case(item,'original');
    perform pg_temp.check_import((select count(*)=original_count and sum(amount_cents)=(item->'original'->>'total')::bigint from public.carrier_transactions where statement_id=first_id),'original entry count and total');
    if item->>'carrier'='Devoted Health' then
      perform pg_temp.reject_import(format('select pg_temp.apply_import_case(%L::jsonb,%L)',item::text,'original'),'Stale preview');
      perform pg_temp.reject_import(format('select pg_temp.apply_import_case(%L::jsonb,%L,%L::uuid[],%L::uuid[])',item::text,'corrected','{}',array[first_id]),'Explicit correction approval');
    else
      perform pg_temp.reject_import(format('select public.import_statement(%L,%L,%L,%L,%s,0,%L::jsonb)',agency,first_id,actor,item->'original'->>'month',item->'original'->>'total',(item->'original'->'rows')::text),'already been imported');
      perform pg_temp.reject_import(format('select pg_temp.apply_import_case(%L::jsonb,%L)',item::text,'original'),'duplicate key');
    end if;
    perform pg_temp.check_import((select count(*)=original_count from public.carrier_transactions where statement_id=first_id),'repeat adds no entries');
    select count(*) into parent_count from public.commission_statements where agency_id=agency;
    select count(*) into source_count from public.commission_statement_sources where agency_id=agency;
    select count(*) into audit_count from public.audit_events where agency_id=agency;
    bad_rows:=jsonb_set(item->'corrected'->'rows','{0,effective_date}','"not-a-date"'::jsonb);
    perform pg_temp.reject_import(format('select pg_temp.apply_import_case(%L::jsonb,%L,%L::uuid[],%L::uuid[],%L::jsonb)',item::text,'corrected',array[first_id],array[first_id],bad_rows::text),'date');
    perform pg_temp.check_import((select status='imported' and superseded_at is null from public.commission_statements where id=first_id),'failed correction keeps original active');
    perform pg_temp.check_import((select count(*)=parent_count from public.commission_statements where agency_id=agency),'failed correction leaves no parent');
    perform pg_temp.check_import((select count(*)=source_count from public.commission_statement_sources where agency_id=agency),'failed correction leaves no source metadata');
    perform pg_temp.check_import((select count(*)=audit_count from public.audit_events where agency_id=agency),'failed correction leaves no partial audit');
    corrected_id:=pg_temp.apply_import_case(item,'corrected',array[first_id],array[first_id]);
    perform pg_temp.check_import((select status='superseded' and superseded_by=corrected_id from public.commission_statements where id=first_id),'original preserved and linked to correction');
    perform pg_temp.check_import((select count(*)=original_count and bool_and(superseded_at is not null) from public.carrier_transactions where statement_id=first_id),'old rows retained');
    perform pg_temp.check_import((select sum(amount_cents)=(item->'corrected'->>'total')::bigint from public.carrier_transactions where agency_id=agency and carrier=item->>'carrier' and superseded_at is null),'active reports include only corrected total');
    perform pg_temp.check_import((select bool_and(user_id=actor and production_entity_id='e7100000-0000-4000-8000-000000000200') from public.carrier_transactions where statement_id=corrected_id),'corrected attribution retained');
    perform pg_temp.check_import((select count(*)=1 from public.audit_events where agency_id=agency and action='statement.superseded' and entity_id=first_id::text),'supersession audited once');
    expected_error:=case when item->>'carrier'='Devoted Health' then 'Stale preview' else 'duplicate key' end;
    perform pg_temp.reject_import(format('select pg_temp.apply_import_case(%L::jsonb,%L)',item::text,'corrected'),expected_error);
    if item->>'carrier'='Devoted Health' then
      perform pg_temp.check_import((select count(*)=4 from public.commission_statement_sources where statement_id in(first_id,corrected_id)),'both old and corrected pairs retained');
    end if;
    raise notice 'PASS %: repeat blocked, correction reconciled, originals retained, failed correction rolled back',item->>'carrier';
  end loop;
  perform pg_temp.check_import(not exists(select 1 from public.agent_earnings where agency_id=agency),'no automatic earnings');
end $$;
rollback;
do $$ begin
  if exists(select 1 from public.agencies where id='e7100000-0000-4000-8000-000000000100') then raise exception 'Synthetic rollback incomplete'; end if;
  raise notice 'PASS: all synthetic test data rolled back';
end $$;
