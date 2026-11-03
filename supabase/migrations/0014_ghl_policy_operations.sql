-- Durable first-pilot journal. No contacts or financial/source rows are changed by this migration.
create table public.ghl_policy_operations (
 id uuid primary key,
 agency_id uuid not null references public.agencies(id) on delete cascade,
 actor_user_id uuid not null references public.users(id) on delete cascade,
 connection_id uuid not null,
 location_id text not null check(location_id ~ '^[A-Za-z0-9]{6,80}$'),
 ghl_user_id text not null check(ghl_user_id ~ '^[A-Za-z0-9]{6,80}$'),
 contact_id text not null check(contact_id ~ '^[A-Za-z0-9]{6,80}$'),
 field_id text not null check(field_id ~ '^[A-Za-z0-9]{6,80}$'),
 source_owner_id uuid not null references public.users(id),
 source_hash text not null check(source_hash ~ '^[a-f0-9]{64}$'),
 source_code text not null check(source_code ~ '^[A-Za-z0-9_-]{1,100}$'),
 source_fingerprint text not null check(source_fingerprint ~ '^[a-f0-9]{64}$'),
 statement_month text not null check(statement_month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
 review_hash text not null check(review_hash ~ '^[a-f0-9]{64}$'),
 snapshot_hash text not null check(snapshot_hash ~ '^[a-f0-9]{64}$'),
 previous_status text check(previous_status in ('Active','Inactive','Future Active','Unknown')),
 phase text not null default 'prepared' check(phase in ('prepared','note_pending','note_confirmed','field_pending','completed','cancelled')),
 note_id text check(note_id ~ '^[A-Za-z0-9]{6,80}$'),
 lease_id uuid,
 lease_until timestamptz,
 last_error text check(last_error in ('paused','note_unconfirmed','write_unconfirmed','access_changed','stale_review')),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create unique index ghl_one_pending_policy_write on public.ghl_policy_operations(connection_id,contact_id,field_id) where phase not in ('completed','cancelled');
alter table public.ghl_policy_operations enable row level security;
revoke all on public.ghl_policy_operations from public,anon,authenticated;
grant all on public.ghl_policy_operations to service_role;

create function public.manage_ghl_policy_operation(p_actor uuid,p_agency uuid,p_action text,p_data jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare actor_role text; op public.ghl_policy_operations%rowtype; c public.ghl_connections%rowtype; assigned text; next_phase text;
begin
 select role into actor_role from public.users where id=p_actor and agency_id=p_agency and active=true for update;
 if actor_role is null or actor_role not in ('owner','agent') then raise exception 'Active producer required'; end if;
 if p_action='prepare' then
   select * into c from public.ghl_connections where id=(p_data->>'connectionId')::uuid and agency_id=p_agency and mode='shared';
 else
   select * into op from public.ghl_policy_operations where id=(p_data->>'id')::uuid and agency_id=p_agency and actor_user_id=p_actor for update;
   if op.id is null then raise exception 'Operation access denied'; end if;
   select * into c from public.ghl_connections where id=op.connection_id and agency_id=p_agency and mode='shared';
 end if;
 if c.id is null or not exists(select 1 from public.ghl_agent_mappings where connection_id=c.id and agency_id=p_agency and user_id=p_actor and ghl_user_id=case when p_action='prepare' then p_data->>'ghlUserId' else op.ghl_user_id end) then raise exception 'Current GHL assignment required'; end if;
 if p_action<>'prepare' then
   if not exists(select 1 from public.users where id=op.source_owner_id and agency_id=p_agency and active=true and role='owner') then raise exception 'Source owner unavailable'; end if;
   if actor_role='owner' and p_actor<>op.source_owner_id then raise exception 'Source access denied'; end if;
   if actor_role='agent' then
     select details->>'agentId' into assigned from public.audit_events where agency_id=p_agency and actor_user_id=op.source_owner_id and action='sunfire.sale_assigned' and entity_id=op.source_hash and details->>'ownerId'=op.source_owner_id::text and details->>'enrollmentCode'=op.source_code order by created_at desc,id desc limit 1;
     if assigned is distinct from p_actor::text then raise exception 'Source assignment required'; end if;
   end if;
 end if;
 if p_action='prepare' then
   if c.location_id<>p_data->>'locationId' then raise exception 'Location changed'; end if;
   perform pg_advisory_xact_lock(hashtextextended(c.id::text||'/'||(p_data->>'contactId')||'/'||(p_data->>'fieldId'),0));
   select * into op from public.ghl_policy_operations where connection_id=c.id and contact_id=p_data->>'contactId' and field_id=p_data->>'fieldId' and phase not in ('completed','cancelled') for update;
   if op.id is not null then
     if op.actor_user_id<>p_actor then raise exception 'Operation access denied'; end if;
     if op.review_hash=p_data->>'reviewHash' then return to_jsonb(op); end if;
     if op.phase<>'prepared' or (op.lease_until is not null and op.lease_until>now()) then raise exception 'Existing operation requires recovery'; end if;
     update public.ghl_policy_operations set phase='cancelled',lease_id=null,lease_until=null,updated_at=now() where id=op.id;
   end if;
   if not exists(select 1 from public.users where id=(p_data->>'ownerId')::uuid and agency_id=p_agency and active=true and role='owner') then raise exception 'Source owner unavailable'; end if;
   if actor_role='owner' and p_actor<>(p_data->>'ownerId')::uuid then raise exception 'Source access denied'; end if;
   if actor_role='agent' then
     select details->>'agentId' into assigned from public.audit_events where agency_id=p_agency and actor_user_id=(p_data->>'ownerId')::uuid and action='sunfire.sale_assigned' and entity_id=p_data->>'sourceHash' and details->>'ownerId'=p_data->>'ownerId' and details->>'enrollmentCode'=p_data->>'code' order by created_at desc,id desc limit 1;
     if assigned is distinct from p_actor::text then raise exception 'Source assignment required'; end if;
   end if;
   insert into public.ghl_policy_operations(id,agency_id,actor_user_id,connection_id,location_id,ghl_user_id,contact_id,field_id,source_owner_id,source_hash,source_code,source_fingerprint,statement_month,review_hash,snapshot_hash,previous_status)
   values((p_data->>'id')::uuid,p_agency,p_actor,c.id,c.location_id,p_data->>'ghlUserId',p_data->>'contactId',p_data->>'fieldId',(p_data->>'ownerId')::uuid,p_data->>'sourceHash',p_data->>'code',p_data->>'sourceFingerprint',p_data->>'statementMonth',p_data->>'reviewHash',p_data->>'snapshotHash',nullif(p_data->>'previousStatus','')) returning * into op;
 elsif p_action='claim' then
   if p_data->>'leaseId' is null then raise exception 'Lease ID required'; end if;
   if op.phase in ('completed','cancelled') then raise exception 'Operation is closed'; end if;
   if op.lease_until is not null and op.lease_until>now() then raise exception 'Operation already running'; end if;
   update public.ghl_policy_operations set lease_id=(p_data->>'leaseId')::uuid,lease_until=now()+interval '5 minutes',last_error=null,updated_at=now() where id=op.id returning * into op;
 elsif p_action='checkpoint' then
   if op.lease_id is null or op.lease_until is null or op.lease_id is distinct from (p_data->>'leaseId')::uuid or op.lease_until<=now() then raise exception 'Operation lease unavailable'; end if;
   next_phase=p_data->>'phase';
   if not ((op.phase='prepared' and next_phase in ('note_pending','note_confirmed','completed')) or (op.phase='note_pending' and next_phase='note_confirmed') or (op.phase='note_confirmed' and next_phase in ('field_pending','completed')) or (op.phase='field_pending' and next_phase in ('field_pending','completed'))) then raise exception 'Invalid operation transition'; end if;
   if next_phase='note_confirmed' and (p_data->>'noteId' is null or (op.note_id is not null and op.note_id<>p_data->>'noteId')) then raise exception 'History note confirmation required'; end if;
   if next_phase in ('field_pending','completed') and op.phase<>'prepared' and op.note_id is null then raise exception 'History note required'; end if;
   update public.ghl_policy_operations set phase=next_phase,note_id=coalesce(p_data->>'noteId',note_id),lease_id=case when next_phase='completed' then null else lease_id end,lease_until=case when next_phase='completed' then null else now()+interval '5 minutes' end,last_error=null,updated_at=now() where id=op.id returning * into op;
   if next_phase='completed' then insert into public.audit_events(agency_id,actor_user_id,action,entity_type,entity_id,details) values(p_agency,p_actor,'ghl.policy_status_write_completed','ghl_policy_operation',op.id::text,jsonb_build_object('version',1,'operationId',op.id,'sourceCode',op.source_code,'basis','commission_reported')); end if;
 elsif p_action='release' then
   if op.phase<>'completed' and op.lease_id is distinct from (p_data->>'leaseId')::uuid then raise exception 'Operation lease unavailable'; end if;
   update public.ghl_policy_operations set lease_id=null,lease_until=null,last_error=case when phase='completed' then null else coalesce(p_data->>'error','paused') end,updated_at=now() where id=op.id returning * into op;
 else raise exception 'Unknown operation action'; end if;
 return to_jsonb(op);
end $$;
revoke all on function public.manage_ghl_policy_operation(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.manage_ghl_policy_operation(uuid,uuid,text,jsonb) to service_role;
