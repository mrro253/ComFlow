-- Explicit policy-specific commission ownership. Source statements and printed writers remain unchanged.
create table public.policy_commission_owners(
 agency_id uuid not null references public.agencies(id),carrier text not null,carrier_member_id text not null,effective_date date not null,
 owner_user_id uuid not null references public.users(id),production_entity_id uuid not null references public.production_entities(id),
 changed_by uuid not null references public.users(id),reason text not null check(length(btrim(reason)) between 1 and 1000),version integer not null default 1,updated_at timestamptz not null default now(),
 primary key(agency_id,carrier,carrier_member_id,effective_date)
);
alter table public.policy_commission_owners enable row level security;
revoke all on public.policy_commission_owners from public,anon,authenticated;
grant all on public.policy_commission_owners to service_role;

create function public.review_policy_commission_owner(p_actor uuid,p_agency uuid,p_entry uuid) returns jsonb
language plpgsql security definer set search_path=public,extensions as $$
declare t public.carrier_transactions%rowtype; snapshot jsonb; rule public.policy_commission_owners%rowtype; locked boolean;
begin
 if not exists(select 1 from public.users where id=p_actor and agency_id=p_agency and active and role='owner') then raise exception 'Active agency owner required'; end if;
 select x.* into t from public.carrier_transactions x join public.commission_statements s on s.id=x.statement_id and s.agency_id=x.agency_id where x.id=p_entry and x.agency_id=p_agency and x.superseded_at is null and s.status='imported' and s.superseded_at is null;
 if t.id is null or btrim(t.carrier_member_id)='' then raise exception 'Active imported policy identifier required'; end if;
 select * into rule from public.policy_commission_owners where agency_id=p_agency and carrier=t.carrier and carrier_member_id=t.carrier_member_id and effective_date=t.effective_date;
 select jsonb_agg(jsonb_build_object('id',x.id,'owner',x.user_id,'writer',x.writing_user_id,'printedWriter',x.writing_agent_name,'writerVerified',x.writing_agent_verified,'entity',x.production_entity_id,'amount',x.amount_cents,'statement',x.statement_id,'key',x.transaction_key) order by x.id) into snapshot
 from public.carrier_transactions x join public.commission_statements s on s.id=x.statement_id and s.agency_id=x.agency_id where x.agency_id=p_agency and x.carrier=t.carrier and x.carrier_member_id=t.carrier_member_id and x.effective_date=t.effective_date and x.superseded_at is null and s.status='imported' and s.superseded_at is null;
 locked:=exists(select 1 from public.agent_earnings e join public.carrier_transactions x on x.id=e.carrier_transaction_id where x.agency_id=p_agency and x.carrier=t.carrier and x.carrier_member_id=t.carrier_member_id and x.effective_date=t.effective_date)
 or exists(select 1 from public.policy_compensation_locks l where l.agency_id=p_agency and l.carrier=t.carrier and l.carrier_member_id=t.carrier_member_id);
 return jsonb_build_object('entryId',t.id,'carrier',t.carrier,'effectiveDate',t.effective_date,'ownerId',t.user_id,'writerName',t.writing_agent_name,'count',jsonb_array_length(snapshot),'locked',locked,'ruleVersion',coalesce(rule.version,0),'reviewHash',encode(digest(convert_to(jsonb_build_object('rows',snapshot,'rule',coalesce(rule.version,0))::text,'UTF8'),'sha256'),'hex'));
end $$;
revoke all on function public.review_policy_commission_owner(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.review_policy_commission_owner(uuid,uuid,uuid) to service_role;

create function public.save_policy_commission_owner(p_actor uuid,p_agency uuid,p_entry uuid,p_owner uuid,p_reason text,p_review_hash text) returns jsonb
language plpgsql security definer set search_path=public,extensions as $$
declare t public.carrier_transactions%rowtype; target public.users%rowtype; entity uuid; entity_count integer; r jsonb; before_rows jsonb; changed integer; mapped record;
begin
 if p_reason is null or length(btrim(p_reason)) not between 1 and 1000 then raise exception 'An explanation is required'; end if;
 if not exists(select 1 from public.users where id=p_actor and agency_id=p_agency and active and role='owner') then raise exception 'Active agency owner required'; end if;
 select * into t from public.carrier_transactions where id=p_entry and agency_id=p_agency;
 if t.id is null then raise exception 'Policy unavailable'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_agency::text||'/'||t.carrier||'/'||t.carrier_member_id,0));
 -- Serialize with policy-write actors and queue claims before examining pending work.
 perform 1 from public.users where agency_id=p_agency and (id in (p_actor,p_owner) or id in(select user_id from public.carrier_transactions where agency_id=p_agency and carrier=t.carrier and carrier_member_id=t.carrier_member_id and effective_date=t.effective_date)) order by id for update;
 for mapped in select m.user_id,m.connection_id from public.ghl_agent_mappings m where m.agency_id=p_agency and (m.user_id=p_owner or m.user_id in(select user_id from public.carrier_transactions where agency_id=p_agency and carrier=t.carrier and carrier_member_id=t.carrier_member_id and effective_date=t.effective_date)) order by m.user_id,m.connection_id loop
  perform pg_advisory_xact_lock(hashtextextended(mapped.user_id::text||'/'||mapped.connection_id::text,0));
 end loop;
 perform 1 from public.carrier_transactions where agency_id=p_agency and carrier=t.carrier and carrier_member_id=t.carrier_member_id and effective_date=t.effective_date order by id for update;
 r:=public.review_policy_commission_owner(p_actor,p_agency,p_entry);
 if r->>'reviewHash' is distinct from p_review_hash then raise exception 'Policy changed; review it again'; end if;
 if (r->>'locked')::boolean then raise exception 'Existing earnings or compensation locks prevent reassignment'; end if;
 if exists(select 1 from public.ghl_policy_operations where agency_id=p_agency and phase not in ('completed','cancelled')) or exists(select 1 from public.ghl_statement_contact_operations o join public.carrier_transactions x on x.id=o.source_entry_id where o.agency_id=p_agency and x.agency_id=p_agency and x.carrier=t.carrier and x.carrier_member_id=t.carrier_member_id and x.effective_date=t.effective_date and (o.phase in ('create_pending','created') or o.phase<>'linked' and o.lease_until>now())) or exists(select 1 from public.ghl_import_jobs j join public.carrier_transactions x on x.statement_id=j.statement_id where j.agency_id=p_agency and j.state='running' and j.lease_until>now() and x.agency_id=p_agency and x.carrier=t.carrier and x.carrier_member_id=t.carrier_member_id and x.effective_date=t.effective_date) then raise exception 'Finish or recover pending GHL processing before changing ownership'; end if;
 select * into target from public.users where id=p_owner and agency_id=p_agency and active and role in ('owner','agent') and agent_type<>'captive';
 if target.id is null then raise exception 'Choose an active owner or agent who receives commission directly; captive production uses its principal'; end if;
 select count(*),min(id::text)::uuid into entity_count,entity from public.production_entities where agency_id=p_agency and (target.role='owner' and entity_type='personal' and user_id=target.id or target.role<>'owner' and entity_type='agency');
 if entity_count<>1 then raise exception 'Configure one unambiguous production category first'; end if;
 select jsonb_agg(jsonb_build_object('entryId',id,'previousOwner',user_id,'previousWriter',writing_user_id,'previousEntity',production_entity_id) order by id) into before_rows from public.carrier_transactions where agency_id=p_agency and carrier=t.carrier and carrier_member_id=t.carrier_member_id and effective_date=t.effective_date and superseded_at is null and statement_id in(select id from public.commission_statements where agency_id=p_agency and status='imported' and superseded_at is null);
 insert into public.policy_commission_owners(agency_id,carrier,carrier_member_id,effective_date,owner_user_id,production_entity_id,changed_by,reason)
 values(p_agency,t.carrier,t.carrier_member_id,t.effective_date,target.id,entity,p_actor,btrim(p_reason))
 on conflict(agency_id,carrier,carrier_member_id,effective_date) do update set owner_user_id=excluded.owner_user_id,production_entity_id=excluded.production_entity_id,changed_by=excluded.changed_by,reason=excluded.reason,version=policy_commission_owners.version+1,updated_at=now();
 update public.carrier_transactions set user_id=target.id,production_entity_id=entity,writing_user_id=coalesce(writing_user_id,user_id)
 where agency_id=p_agency and carrier=t.carrier and carrier_member_id=t.carrier_member_id and effective_date=t.effective_date and superseded_at is null and statement_id in(select id from public.commission_statements where agency_id=p_agency and status='imported' and superseded_at is null);
 get diagnostics changed=row_count;
 insert into public.audit_events(agency_id,actor_user_id,action,entity_type,entity_id,details) values(p_agency,p_actor,'policy.commission_owner_changed','carrier_transaction',t.id::text,jsonb_build_object('ownerId',target.id,'entries',before_rows,'reason',btrim(p_reason),'scope','carrier_member_effective_date','rows',changed));
 return jsonb_build_object('changed',changed,'ownerId',target.id);
end $$;
revoke all on function public.save_policy_commission_owner(uuid,uuid,uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.save_policy_commission_owner(uuid,uuid,uuid,uuid,text,text) to service_role;

create function public.apply_policy_commission_owner() returns trigger language plpgsql security definer set search_path=public as $$
declare r public.policy_commission_owners%rowtype;
begin
 perform pg_advisory_xact_lock(hashtextextended(new.agency_id::text||'/'||new.carrier||'/'||new.carrier_member_id,0));
 select * into r from public.policy_commission_owners where agency_id=new.agency_id and carrier=new.carrier and carrier_member_id=new.carrier_member_id and effective_date=new.effective_date;
 if r.agency_id is not null then
  if not exists(select 1 from public.users u join public.production_entities p on p.id=r.production_entity_id and p.agency_id=u.agency_id where u.id=r.owner_user_id and u.agency_id=r.agency_id and u.active and u.role in ('owner','agent') and u.agent_type<>'captive' and (u.role='owner' and p.entity_type='personal' and p.user_id=u.id or u.role='agent' and p.entity_type='agency')) then raise exception 'Saved policy commission owner is unavailable; review ownership before importing'; end if;
  new.writing_user_id:=coalesce(new.writing_user_id,new.user_id);new.user_id:=r.owner_user_id;new.production_entity_id:=r.production_entity_id;
 end if;
 return new;
end $$;
revoke all on function public.apply_policy_commission_owner() from public,anon,authenticated;
create trigger apply_saved_policy_commission_owner before insert on public.carrier_transactions for each row execute function public.apply_policy_commission_owner();

-- Serialize compensation persistence with ownership edits; stale plans cannot earn for the prior owner.
create function public.guard_policy_owner_finance() returns trigger language plpgsql security definer set search_path=public as $$
declare t public.carrier_transactions%rowtype;
begin
 if tg_table_name='agent_earnings' then
  select * into t from public.carrier_transactions where id=new.carrier_transaction_id and agency_id=new.agency_id;
  if t.id is null then raise exception 'Commission source unavailable'; end if;
  perform pg_advisory_xact_lock(hashtextextended(t.agency_id::text||'/'||t.carrier||'/'||t.carrier_member_id,0));
  select * into t from public.carrier_transactions where id=new.carrier_transaction_id and agency_id=new.agency_id for share;
  if exists(select 1 from public.policy_commission_owners r where r.agency_id=t.agency_id and r.carrier=t.carrier and r.carrier_member_id=t.carrier_member_id and r.effective_date=t.effective_date) and t.user_id is distinct from new.user_id then raise exception 'Commission owner changed; rebuild the earning preview'; end if;
 else
  perform pg_advisory_xact_lock(hashtextextended(new.agency_id::text||'/'||new.carrier||'/'||new.carrier_member_id,0));
  if exists(select 1 from public.policy_commission_owners r where r.agency_id=new.agency_id and r.carrier=new.carrier and r.carrier_member_id=new.carrier_member_id and r.owner_user_id<>new.user_id) then raise exception 'Policy ownership differs; review the compensation mapping'; end if;
 end if;
 return new;
end $$;
revoke all on function public.guard_policy_owner_finance() from public,anon,authenticated;
create trigger check_policy_owner_earning before insert on public.agent_earnings for each row execute function public.guard_policy_owner_finance();
create trigger check_policy_owner_lock before insert on public.policy_compensation_locks for each row execute function public.guard_policy_owner_finance();
