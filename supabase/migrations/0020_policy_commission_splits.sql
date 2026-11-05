-- Two-agent policy commission credit, separate from carrier source amounts and agency payouts.
create table public.policy_commission_splits(
 agency_id uuid not null references public.agencies(id),carrier text not null,carrier_member_id text not null,effective_date date not null,
 first_user_id uuid not null references public.users(id),second_user_id uuid not null references public.users(id),first_basis_points integer not null check(first_basis_points between 1 and 9999),
 enabled boolean not null default true,version integer not null default 1,changed_by uuid not null references public.users(id),reason text not null check(length(btrim(reason)) between 1 and 1000),updated_at timestamptz not null default now(),
 check(first_user_id<>second_user_id),primary key(agency_id,carrier,carrier_member_id,effective_date)
);
create table public.commission_split_entries(
 transaction_id uuid primary key references public.carrier_transactions(id),agency_id uuid not null references public.agencies(id),rule_version integer not null
);
create table public.commission_allocations(
 transaction_id uuid not null references public.commission_split_entries(transaction_id),agency_id uuid not null references public.agencies(id),user_id uuid not null references public.users(id),basis_points integer not null check(basis_points between 1 and 9999),amount_cents bigint not null,rule_version integer not null,primary key(transaction_id,user_id)
);
alter table public.policy_commission_splits enable row level security;
alter table public.commission_split_entries enable row level security;
alter table public.commission_allocations enable row level security;
revoke all on public.policy_commission_splits,public.commission_split_entries,public.commission_allocations from public,anon,authenticated;
grant all on public.policy_commission_splits,public.commission_split_entries,public.commission_allocations to service_role;
grant select on public.commission_split_entries,public.commission_allocations to authenticated;
create function public.can_read_commission_share(p_agency uuid,p_user uuid) returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from public.users a where a.id=auth.uid() and a.agency_id=p_agency and a.active and (a.role='owner' or a.id=p_user or public.can_see_direct_reports() and exists(select 1 from public.users t where t.id=p_user and t.agency_id=p_agency and t.manager_id=a.id)))
$$;
revoke all on function public.can_read_commission_share(uuid,uuid) from public,anon;
grant execute on function public.can_read_commission_share(uuid,uuid) to authenticated;
create policy allocation_recipient_read on public.commission_allocations for select to authenticated using(public.can_read_commission_share(agency_id,user_id));
create function public.can_read_split_entry(p_agency uuid,p_entry uuid) returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from public.carrier_transactions t where t.id=p_entry and t.agency_id=p_agency and (public.can_read_commission_share(p_agency,t.user_id) or public.can_read_commission_share(p_agency,t.writing_user_id) or exists(select 1 from public.commission_allocations a where a.transaction_id=t.id and a.agency_id=p_agency and public.can_read_commission_share(p_agency,a.user_id))))
$$;
revoke all on function public.can_read_split_entry(uuid,uuid) from public,anon;
grant execute on function public.can_read_split_entry(uuid,uuid) to authenticated;
create policy split_entry_read on public.commission_split_entries for select to authenticated using(public.can_read_split_entry(agency_id,transaction_id));
create policy allocated_transaction_read on public.carrier_transactions for select to authenticated using(agency_id=public.get_my_agency_id() and exists(select 1 from public.commission_allocations a where a.transaction_id=carrier_transactions.id and a.agency_id=carrier_transactions.agency_id));

create function public.write_commission_allocations(p_entry uuid) returns void language plpgsql security definer set search_path=public as $$
declare t public.carrier_transactions%rowtype; r public.policy_commission_splits%rowtype; first_cents bigint;
begin
 select * into t from public.carrier_transactions where id=p_entry;
 if t.id is null then raise exception 'Source unavailable';end if;
 select * into r from public.policy_commission_splits where agency_id=t.agency_id and carrier=t.carrier and carrier_member_id=t.carrier_member_id and effective_date=t.effective_date and enabled;
 if r.agency_id is null then return;end if;
 if (select count(*) from public.users where id in (r.first_user_id,r.second_user_id) and agency_id=r.agency_id and active and role in ('owner','agent') and agent_type is distinct from 'captive')<>2 then raise exception 'Split recipient unavailable; review before importing';end if;
 first_cents:=sign(t.amount_cents)*floor((abs(t.amount_cents::numeric)*r.first_basis_points+5000)/10000)::bigint;
 insert into public.commission_split_entries(transaction_id,agency_id,rule_version) values(t.id,t.agency_id,r.version);
 insert into public.commission_allocations(transaction_id,agency_id,user_id,basis_points,amount_cents,rule_version) values(t.id,t.agency_id,r.first_user_id,r.first_basis_points,first_cents,r.version),(t.id,t.agency_id,r.second_user_id,10000-r.first_basis_points,t.amount_cents-first_cents,r.version);
end $$;
revoke all on function public.write_commission_allocations(uuid) from public,anon,authenticated,service_role;
create function public.allocate_imported_commission() returns trigger language plpgsql security definer set search_path=public as $$
begin perform public.write_commission_allocations(new.id);return new;end $$;
revoke all on function public.allocate_imported_commission() from public,anon,authenticated;
create trigger allocate_imported_commission after insert on public.carrier_transactions for each row execute function public.allocate_imported_commission();

alter function public.review_policy_commission_owner(uuid,uuid,uuid) rename to review_policy_commission_owner_base;
revoke all on function public.review_policy_commission_owner_base(uuid,uuid,uuid) from public,anon,authenticated,service_role;
create function public.review_policy_commission_owner(p_actor uuid,p_agency uuid,p_entry uuid) returns jsonb language plpgsql security definer set search_path=public,extensions as $$
declare base jsonb;t public.carrier_transactions%rowtype;r public.policy_commission_splits%rowtype;
begin
 base:=public.review_policy_commission_owner_base(p_actor,p_agency,p_entry);
 select * into t from public.carrier_transactions where id=p_entry and agency_id=p_agency;
 select * into r from public.policy_commission_splits where agency_id=p_agency and carrier=t.carrier and carrier_member_id=t.carrier_member_id and effective_date=t.effective_date;
 return base||jsonb_build_object('splitEnabled',coalesce(r.enabled,false),'firstUserId',r.first_user_id,'secondUserId',r.second_user_id,'firstBasisPoints',r.first_basis_points,'reviewHash',encode(digest(convert_to((base->>'reviewHash')||'/'||coalesce(r.version,0)::text,'UTF8'),'sha256'),'hex'));
end $$;
revoke all on function public.review_policy_commission_owner(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.review_policy_commission_owner(uuid,uuid,uuid) to service_role;
alter function public.save_policy_commission_owner(uuid,uuid,uuid,uuid,text,text) rename to save_single_policy_commission_owner;
revoke all on function public.save_single_policy_commission_owner(uuid,uuid,uuid,uuid,text,text) from public,anon,authenticated,service_role;
create function public.save_policy_commission_owner(p_actor uuid,p_agency uuid,p_entry uuid,p_owner uuid,p_reason text,p_review_hash text) returns jsonb language plpgsql security definer set search_path=public as $$
declare t public.carrier_transactions%rowtype;
begin
 perform public.review_policy_commission_owner(p_actor,p_agency,p_entry);
 select * into t from public.carrier_transactions where id=p_entry and agency_id=p_agency;
 perform pg_advisory_xact_lock(hashtextextended(p_agency::text||'/'||t.carrier||'/'||t.carrier_member_id,0));
 if exists(select 1 from public.policy_commission_splits where agency_id=p_agency and carrier=t.carrier and carrier_member_id=t.carrier_member_id and effective_date=t.effective_date and enabled) then raise exception 'Change or remove the split before selecting a sole owner';end if;
 return public.save_single_policy_commission_owner(p_actor,p_agency,p_entry,p_owner,p_reason,p_review_hash);
end $$;
revoke all on function public.save_policy_commission_owner(uuid,uuid,uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.save_policy_commission_owner(uuid,uuid,uuid,uuid,text,text) to service_role;

create function public.save_policy_commission_split(p_actor uuid,p_agency uuid,p_entry uuid,p_first uuid,p_second uuid,p_basis_points integer,p_enabled boolean,p_reason text,p_review_hash text) returns jsonb language plpgsql security definer set search_path=public as $$
declare t public.carrier_transactions%rowtype; review jsonb; old_rule public.policy_commission_splits%rowtype; item record; affected integer; mapped record;
begin
 review:=public.review_policy_commission_owner(p_actor,p_agency,p_entry);
 if p_enabled is null or p_reason is null or length(btrim(p_reason)) not between 1 and 1000 then raise exception 'Explanation required';end if;
 select * into t from public.carrier_transactions where id=p_entry and agency_id=p_agency;
 perform pg_advisory_xact_lock(hashtextextended(p_agency::text||'/'||t.carrier||'/'||t.carrier_member_id,0));
 perform 1 from public.users where agency_id=p_agency and (id in(p_actor,p_first,p_second) or id in(select user_id from public.carrier_transactions where agency_id=p_agency and carrier=t.carrier and carrier_member_id=t.carrier_member_id and effective_date=t.effective_date)) order by id for update;
 for mapped in select user_id,connection_id from public.ghl_agent_mappings where agency_id=p_agency order by user_id,connection_id loop perform pg_advisory_xact_lock(hashtextextended(mapped.user_id::text||'/'||mapped.connection_id::text,0));end loop;
 perform 1 from public.carrier_transactions where agency_id=p_agency and carrier=t.carrier and carrier_member_id=t.carrier_member_id and effective_date=t.effective_date order by id for update;
 review:=public.review_policy_commission_owner(p_actor,p_agency,p_entry);
 if review->>'reviewHash' is distinct from p_review_hash then raise exception 'Split review changed';end if;
 if (review->>'locked')::boolean then raise exception 'Earnings or compensation locks prevent changing this split';end if;
 if exists(select 1 from public.ghl_policy_operations where agency_id=p_agency and phase not in('completed','cancelled')) or exists(select 1 from public.ghl_import_jobs where agency_id=p_agency and state='running' and lease_until>now()) or exists(select 1 from public.ghl_statement_contact_operations where agency_id=p_agency and (phase in('create_pending','created') or phase<>'linked' and lease_until>now())) then raise exception 'Finish pending GHL work first';end if;
 select * into old_rule from public.policy_commission_splits where agency_id=p_agency and carrier=t.carrier and carrier_member_id=t.carrier_member_id and effective_date=t.effective_date;
 if p_enabled then
  if p_first is null or p_second is null or p_first=p_second or p_basis_points is null or p_basis_points not between 1 and 9999 or (select count(*) from public.users where id in(p_first,p_second) and agency_id=p_agency and active and role in('owner','agent') and agent_type is distinct from 'captive')<>2 then raise exception 'Choose two distinct active direct recipients and a valid percentage';end if;
  insert into public.policy_commission_splits(agency_id,carrier,carrier_member_id,effective_date,first_user_id,second_user_id,first_basis_points,changed_by,reason)
  values(p_agency,t.carrier,t.carrier_member_id,t.effective_date,p_first,p_second,p_basis_points,p_actor,btrim(p_reason))
  on conflict(agency_id,carrier,carrier_member_id,effective_date) do update set first_user_id=excluded.first_user_id,second_user_id=excluded.second_user_id,first_basis_points=excluded.first_basis_points,enabled=true,version=policy_commission_splits.version+1,changed_by=p_actor,reason=excluded.reason,updated_at=now();
 else
  if old_rule.agency_id is null or not old_rule.enabled then raise exception 'No active split';end if;
  update public.policy_commission_splits set enabled=false,version=version+1,changed_by=p_actor,reason=btrim(p_reason),updated_at=now() where agency_id=p_agency and carrier=t.carrier and carrier_member_id=t.carrier_member_id and effective_date=t.effective_date;
 end if;
 affected:=0;
 for item in select x.id from public.carrier_transactions x join public.commission_statements s on s.id=x.statement_id and s.agency_id=x.agency_id where x.agency_id=p_agency and x.carrier=t.carrier and x.carrier_member_id=t.carrier_member_id and x.effective_date=t.effective_date and x.superseded_at is null and s.status='imported' and s.superseded_at is null loop
  delete from public.commission_allocations where transaction_id=item.id and agency_id=p_agency;
  delete from public.commission_split_entries where transaction_id=item.id and agency_id=p_agency;
  if p_enabled then perform public.write_commission_allocations(item.id);end if;affected:=affected+1;
 end loop;
 insert into public.audit_events(agency_id,actor_user_id,action,entity_type,entity_id,details) values(p_agency,p_actor,'policy.commission_split_changed','carrier_transaction',p_entry::text,jsonb_build_object('previous',to_jsonb(old_rule),'enabled',p_enabled,'firstUserId',p_first,'secondUserId',p_second,'firstBasisPoints',p_basis_points,'reason',btrim(p_reason),'rows',affected));
 return jsonb_build_object('changed',affected,'enabled',p_enabled);
end $$;
revoke all on function public.save_policy_commission_split(uuid,uuid,uuid,uuid,uuid,integer,boolean,text,text) from public,anon,authenticated;
grant execute on function public.save_policy_commission_split(uuid,uuid,uuid,uuid,uuid,integer,boolean,text,text) to service_role;

-- Agency payouts require allocation-aware earning support; never pay the whole source again.
create function public.guard_split_payout() returns trigger language plpgsql security definer set search_path=public as $$
declare t public.carrier_transactions%rowtype;
begin
 if tg_table_name='agent_earnings' then
  select * into t from public.carrier_transactions where id=new.carrier_transaction_id and agency_id=new.agency_id;
  perform pg_advisory_xact_lock(hashtextextended(t.agency_id::text||'/'||t.carrier||'/'||t.carrier_member_id,0));
  if exists(select 1 from public.commission_split_entries where transaction_id=t.id and agency_id=t.agency_id) then raise exception 'Split policy credit cannot use the whole-source payout path';end if;
 else
  perform pg_advisory_xact_lock(hashtextextended(new.agency_id::text||'/'||new.carrier||'/'||new.carrier_member_id,0));
  if exists(select 1 from public.policy_commission_splits where agency_id=new.agency_id and carrier=new.carrier and carrier_member_id=new.carrier_member_id and enabled) then raise exception 'Split policy compensation requires allocation-aware review';end if;
 end if;return new;
end $$;
revoke all on function public.guard_split_payout() from public,anon,authenticated;
create trigger guard_split_earning before insert on public.agent_earnings for each row execute function public.guard_split_payout();
create trigger guard_split_lock before insert on public.policy_compensation_locks for each row execute function public.guard_split_payout();

create or replace function public.save_single_policy_commission_owner(p_actor uuid,p_agency uuid,p_entry uuid,p_owner uuid,p_reason text,p_review_hash text) returns jsonb
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
 select * into target from public.users where id=p_owner and agency_id=p_agency and active and role in ('owner','agent') and agent_type is distinct from 'captive';
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
