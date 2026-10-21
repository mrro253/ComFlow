-- REVIEW BRANCH ONLY. Do not apply to the working/pilot database before Marshall approval.
-- Paired source identity leaves existing PDF fields and all Ultimate rows unchanged.
alter table public.commission_statements
  add column source_pair_hash text check (source_pair_hash ~ '^[a-f0-9]{64}$'),
  add column statement_pay_date date,
  add column devoted_payee_hash text check (devoted_payee_hash ~ '^[a-f0-9]{64}$'),
  add column payment_period_start date,
  add column payment_period_end date,
  add column parser_version text,
  add constraint statement_agency_id_unique unique (agency_id, id),
  add constraint devoted_pair_required check (carrier <> 'Devoted Health' or (
    source_pair_hash is not null and statement_pay_date is not null and devoted_payee_hash is not null
    and payment_period_start is not null and payment_period_end is not null
    and payment_period_start <= payment_period_end and payment_period_end <= statement_pay_date
    and parser_version is not null
  ));
alter table public.commission_statements drop constraint commission_statements_agency_id_file_hash_key;
create unique index statements_single_pdf_unique on public.commission_statements(agency_id,file_hash) where carrier <> 'Devoted Health';
create unique index statements_devoted_pair_unique on public.commission_statements(agency_id,source_pair_hash) where carrier = 'Devoted Health';

create table public.commission_statement_sources (
  agency_id uuid not null references public.agencies(id),
  statement_id uuid not null,
  source_kind text not null check (source_kind in ('pdf','workbook')),
  storage_path text not null,
  sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
  byte_size integer not null check (byte_size between 1 and 15728640),
  media_type text not null,
  created_at timestamptz not null default now(),
  primary key (statement_id,source_kind),
  foreign key (agency_id,statement_id) references public.commission_statements(agency_id,id),
  check ((source_kind='pdf' and media_type='application/pdf') or
    (source_kind='workbook' and media_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'))
);
alter table public.commission_statement_sources enable row level security;
revoke all on public.commission_statement_sources from anon,authenticated;
grant select on public.commission_statement_sources to authenticated;
grant select,insert on public.commission_statement_sources to service_role;
-- Full-source metadata is restricted to owner review for this first Devoted implementation.
create policy devoted_sources_owner_read on public.commission_statement_sources for select to authenticated
  using (agency_id=public.get_my_agency_id() and public.get_my_role()='owner');

create function public.immutable_devoted_source() returns trigger language plpgsql set search_path=public as $$
begin raise exception 'Registered source evidence is immutable'; end;
$$;
create trigger immutable_statement_sources before update or delete on public.commission_statement_sources
  for each row execute function public.immutable_devoted_source();
create function public.guard_devoted_statement_identity() returns trigger language plpgsql set search_path=public as $$
begin
  if old.carrier='Devoted Health' and row(new.agency_id,new.carrier,new.file_hash,new.storage_path,new.source_pair_hash,new.statement_pay_date,new.devoted_payee_hash,new.payment_period_start,new.payment_period_end,new.parser_version)
    is distinct from row(old.agency_id,old.carrier,old.file_hash,old.storage_path,old.source_pair_hash,old.statement_pay_date,old.devoted_payee_hash,old.payment_period_start,old.payment_period_end,old.parser_version) then
    raise exception 'Devoted source identity is immutable';
  end if;
  return new;
end;
$$;
create trigger guard_devoted_statement_identity before update on public.commission_statements
  for each row execute function public.guard_devoted_statement_identity();

-- Preserve existing import behavior behind a private implementation. Generic RPC cannot bypass paired guards.
alter function public.import_statement(uuid,uuid,uuid,text,bigint,bigint,jsonb,uuid[]) rename to import_pdf_statement_v1;
revoke all on function public.import_pdf_statement_v1(uuid,uuid,uuid,text,bigint,bigint,jsonb,uuid[]) from public,anon,authenticated,service_role;
create function public.import_statement(p_agency_id uuid,p_statement_id uuid,p_actor uuid,p_statement_month text,p_statement_total_cents bigint,p_carried_balance_cents bigint,p_rows jsonb,p_supersedes uuid[] default '{}')
returns integer language plpgsql security definer set search_path=public as $$
begin
  if exists(select 1 from public.commission_statements where id=p_statement_id and carrier='Devoted Health')
    or exists(select 1 from jsonb_array_elements(p_rows) r where r->>'carrier'='Devoted Health') then
    raise exception 'Devoted requires paired import';
  end if;
  if exists(select 1 from public.commission_statements where id=any(p_supersedes) and carrier='Devoted Health') then
    raise exception 'Single-PDF imports cannot supersede Devoted evidence';
  end if;
  return public.import_pdf_statement_v1(p_agency_id,p_statement_id,p_actor,p_statement_month,p_statement_total_cents,p_carried_balance_cents,p_rows,p_supersedes);
end;
$$;
revoke all on function public.import_statement(uuid,uuid,uuid,text,bigint,bigint,jsonb,uuid[]) from public,anon,authenticated;
grant execute on function public.import_statement(uuid,uuid,uuid,text,bigint,bigint,jsonb,uuid[]) to service_role;

create function public.import_devoted_pair(
  p_agency_id uuid,p_actor uuid,p_pdf_hash text,p_workbook_hash text,p_pair_hash text,
  p_pdf_size integer,p_workbook_size integer,p_pay_date date,p_payee_hash text,
  p_period_start date,p_period_end date,p_total_cents bigint,p_rows jsonb,
  p_expected_existing uuid[],p_supersedes uuid[],p_parser_version text
) returns uuid language plpgsql security definer set search_path=public,extensions as $$
declare
  v_id uuid; v_current uuid[]; v_row jsonb; v_month text := to_char(p_pay_date,'YYYY-MM');
  v_sum bigint; v_base text := p_agency_id::text||'/devoted/'||p_pair_hash;
begin
  if not exists(select 1 from public.users where id=p_actor and agency_id=p_agency_id and role='owner' and active) then raise exception 'Owner required'; end if;
  if p_parser_version <> 'devoted-pair-v1-single-renewal' or p_parser_version is null then raise exception 'Unsupported parser version'; end if;
  if p_pdf_hash !~ '^[a-f0-9]{64}$' or p_workbook_hash !~ '^[a-f0-9]{64}$' or p_payee_hash !~ '^[a-f0-9]{64}$'
    or p_pdf_hash is null or p_workbook_hash is null or p_pair_hash is null or p_payee_hash is null then raise exception 'Invalid hashes'; end if;
  if p_pair_hash <> encode(digest(convert_to('["devoted-pair-v1","'||p_pdf_hash||'","'||p_workbook_hash||'"]','UTF8'),'sha256'),'hex') then raise exception 'Pair hash mismatch'; end if;
  -- Serialize revisions of this payee/pay date, including concurrent first-time approvals.
  perform pg_advisory_xact_lock(hashtextextended(p_agency_id::text||':'||p_payee_hash||':'||p_pay_date::text,0));
  select coalesce(array_agg(id order by id),'{}'::uuid[]) into v_current from public.commission_statements
    where agency_id=p_agency_id and carrier='Devoted Health' and statement_pay_date=p_pay_date and devoted_payee_hash=p_payee_hash and status='imported';
  if v_current is distinct from (select coalesce(array_agg(x order by x),'{}'::uuid[]) from unnest(p_expected_existing) x) then raise exception 'Stale preview'; end if;
  if cardinality(v_current)>1 or v_current is distinct from (select coalesce(array_agg(x order by x),'{}'::uuid[]) from unnest(p_supersedes) x) then raise exception 'Explicit correction approval required'; end if;
  if exists(select 1 from public.commission_statements where agency_id=p_agency_id and source_pair_hash=p_pair_hash) then raise exception 'Source pair already registered'; end if;
  if p_total_cents is null or p_total_cents<0 or p_total_cents>9007199254740991 or jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows)>1 then raise exception 'Unsupported rows'; end if;
  select coalesce(sum((r->>'amount_cents')::bigint),0) into v_sum from jsonb_array_elements(p_rows) r;
  if v_sum<>p_total_cents then raise exception 'Rows do not reconcile'; end if;
  for v_row in select * from jsonb_array_elements(p_rows) loop
    if v_row->>'carrier' is distinct from 'Devoted Health' or v_row->>'statement_month' is distinct from v_month
      or v_row->>'commission_type' is distinct from 'RENEWAL' or (v_row->>'amount_cents')::bigint<=0
      or coalesce(v_row->>'carrier_member_id','')='' or coalesce(v_row->>'transaction_key','') !~ '^[a-f0-9]{64}$'
      or (v_row->>'effective_date') is null then raise exception 'Invalid source row'; end if;
    if nullif(v_row->>'user_id','') is not null and not exists(select 1 from public.users where id=(v_row->>'user_id')::uuid and agency_id=p_agency_id and active) then raise exception 'Wrong agency assignment'; end if;
    if nullif(v_row->>'writing_user_id','') is not null and not exists(select 1 from public.users where id=(v_row->>'writing_user_id')::uuid and agency_id=p_agency_id and active) then raise exception 'Wrong writer agency'; end if;
    if nullif(v_row->>'production_entity_id','') is not null and not exists(select 1 from public.production_entities where id=(v_row->>'production_entity_id')::uuid and agency_id=p_agency_id) then raise exception 'Wrong production agency'; end if;
  end loop;
  insert into public.commission_statements(agency_id,carrier,statement_month,source,original_filename,storage_path,file_hash,uploaded_by,source_pair_hash,statement_pay_date,devoted_payee_hash,payment_period_start,payment_period_end,parser_version)
    values(p_agency_id,'Devoted Health',v_month,'upload','Devoted paired statement',v_base||'.pdf',p_pdf_hash,p_actor,p_pair_hash,p_pay_date,p_payee_hash,p_period_start,p_period_end,p_parser_version) returning id into v_id;
  insert into public.commission_statement_sources(agency_id,statement_id,source_kind,storage_path,sha256,byte_size,media_type) values
    (p_agency_id,v_id,'pdf',v_base||'.pdf',p_pdf_hash,p_pdf_size,'application/pdf'),
    (p_agency_id,v_id,'workbook',v_base||'.xlsx',p_workbook_hash,p_workbook_size,'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  perform public.import_pdf_statement_v1(p_agency_id,v_id,p_actor,v_month,p_total_cents,0,p_rows,p_supersedes);
  insert into public.audit_events(agency_id,actor_user_id,action,entity_type,entity_id,details)
    values(p_agency_id,p_actor,'devoted.pair_verified','commission_statement',v_id::text,jsonb_build_object('pair_hash',p_pair_hash,'parser_version',p_parser_version));
  return v_id;
end;
$$;
revoke all on function public.import_devoted_pair(uuid,uuid,text,text,text,integer,integer,date,text,date,date,bigint,jsonb,uuid[],uuid[],text) from public,anon,authenticated;
grant execute on function public.import_devoted_pair(uuid,uuid,text,text,text,integer,integer,date,text,date,date,bigint,jsonb,uuid[],uuid[],text) to service_role;
-- Keep the bucket private. Null MIME list already allows the verified workbook type.
do $$ begin
 if to_regclass('storage.buckets') is not null then
  update storage.buckets set allowed_mime_types=array_append(allowed_mime_types,'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
   where id='statements' and allowed_mime_types is not null and not ('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'=any(allowed_mime_types));
 end if;
end $$;
