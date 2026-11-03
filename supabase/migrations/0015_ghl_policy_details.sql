-- Reviewed policy details share the existing private journal and recovery protocol.
-- No existing operation, contact, source or financial row is rewritten.
alter table public.ghl_policy_operations add column payload jsonb;
alter table public.ghl_policy_operations add constraint ghl_policy_payload_object check(payload is null or (jsonb_typeof(payload)='object' and payload->>'kind'='details'));
drop index public.ghl_one_pending_policy_write;
create unique index ghl_one_pending_policy_write on public.ghl_policy_operations(connection_id,contact_id) where phase not in ('completed','cancelled');
create or replace function public.manage_ghl_policy_operation(p_actor uuid,p_agency uuid,p_action text,p_data jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare actor_role text; op public.ghl_policy_operations%rowtype; c public.ghl_connections%rowtype; assigned text; next_phase text; item jsonb; keys text[];
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
   if p_data->'payload' is not null and p_data->'payload'<>'null'::jsonb then
     if p_data->>'fieldId'<>'PolicyDetails' or (p_data->'payload'->>'kind') is distinct from 'details' or jsonb_typeof(p_data->'payload'->'changes') is distinct from 'array' or jsonb_array_length(p_data->'payload'->'changes') not between 1 and 3 then raise exception 'Invalid details payload'; end if;
     keys:=array[]::text[];
     for item in select value from jsonb_array_elements(p_data->'payload'->'changes') loop
       if item->>'key' is null or item->>'key' not in ('plan','date','type') or item->>'key'=any(keys) or coalesce(item->>'fieldId','') !~ '^[A-Za-z0-9]{6,80}$' or jsonb_typeof(item->'target') is distinct from 'string' or length(item->>'target') not between 1 and 1000 or coalesce(jsonb_typeof(item->'previous'),'missing') not in ('string','null') then raise exception 'Invalid details value'; end if;
       keys:=array_append(keys,item->>'key');
     end loop;
   elsif p_data->>'fieldId'='PolicyDetails' then raise exception 'Details payload required'; end if;
   perform pg_advisory_xact_lock(hashtextextended(c.id::text||'/'||(p_data->>'contactId'),0));
   select * into op from public.ghl_policy_operations where connection_id=c.id and contact_id=p_data->>'contactId' and phase not in ('completed','cancelled') for update;
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
   insert into public.ghl_policy_operations(id,agency_id,actor_user_id,connection_id,location_id,ghl_user_id,contact_id,field_id,source_owner_id,source_hash,source_code,source_fingerprint,statement_month,review_hash,snapshot_hash,previous_status,payload)
   values((p_data->>'id')::uuid,p_agency,p_actor,c.id,c.location_id,p_data->>'ghlUserId',p_data->>'contactId',p_data->>'fieldId',(p_data->>'ownerId')::uuid,p_data->>'sourceHash',p_data->>'code',p_data->>'sourceFingerprint',p_data->>'statementMonth',p_data->>'reviewHash',p_data->>'snapshotHash',nullif(p_data->>'previousStatus',''),nullif(p_data->'payload','null'::jsonb)) returning * into op;
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
   if next_phase='completed' then insert into public.audit_events(agency_id,actor_user_id,action,entity_type,entity_id,details) values(p_agency,p_actor,case when op.payload is null then 'ghl.policy_status_write_completed' else 'ghl.policy_details_write_completed' end,'ghl_policy_operation',op.id::text,jsonb_build_object('version',1,'operationId',op.id,'sourceCode',op.source_code,'basis','commission_reported')); end if;
 elsif p_action='release' then
   if op.phase<>'completed' and op.lease_id is distinct from (p_data->>'leaseId')::uuid then raise exception 'Operation lease unavailable'; end if;
   update public.ghl_policy_operations set lease_id=null,lease_until=null,last_error=case when phase='completed' then null else coalesce(p_data->>'error','paused') end,updated_at=now() where id=op.id returning * into op;
 else raise exception 'Unknown operation action'; end if;
 return to_jsonb(op);
end $$;
revoke all on function public.manage_ghl_policy_operation(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.manage_ghl_policy_operation(uuid,uuid,text,jsonb) to service_role;
