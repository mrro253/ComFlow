-- Agent automation: own credited statement rows and current GHL assignment only.
-- No imported financial/source records or GHL records are modified.
create function public.assert_ghl_policy_source(p_actor uuid,p_agency uuid,p_owner uuid,p_hash text,p_code text)
returns void language plpgsql security definer set search_path=public as $$
declare actor_role text; assigned text;
begin
 select role into actor_role from public.users where id=p_actor and agency_id=p_agency and active;
 if actor_role is null or actor_role not in ('owner','agent') then raise exception 'Active producer required'; end if;
 if left(p_code,5)='STMT_' then
  if p_owner<>p_actor or not exists(
   select 1 from public.carrier_transactions t join public.commission_statements s on s.id=t.statement_id and s.agency_id=t.agency_id
   where 'STMT_'||replace(t.id::text,'-','')=p_code and t.agency_id=p_agency and t.user_id=p_actor
    and t.superseded_at is null and s.status='imported' and s.superseded_at is null and s.file_hash=p_hash
  ) then raise exception 'Current credited statement source required'; end if;
 else
  if not exists(select 1 from public.users where id=p_owner and agency_id=p_agency and active and role='owner') then raise exception 'Source owner unavailable'; end if;
  if actor_role='owner' and p_actor<>p_owner then raise exception 'Source access denied'; end if;
  if actor_role='agent' then
   select details->>'agentId' into assigned from public.audit_events where agency_id=p_agency and actor_user_id=p_owner
    and action='sunfire.sale_assigned' and entity_id=p_hash and details->>'ownerId'=p_owner::text and details->>'enrollmentCode'=p_code
    order by created_at desc,id desc limit 1;
   if assigned is distinct from p_actor::text then raise exception 'Source assignment required'; end if;
  end if;
 end if;
end $$;
revoke all on function public.assert_ghl_policy_source(uuid,uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.assert_ghl_policy_source(uuid,uuid,uuid,text,text) to service_role;

create or replace function public.queue_ghl_after_statement_import() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if new.status<>'imported' or new.superseded_at is not null then return new; end if;
 if tg_op='UPDATE' then if old.status='imported' then return new; end if; end if;
 insert into public.ghl_import_jobs(agency_id,actor_user_id,connection_id,location_id,ghl_user_id,statement_id)
 select distinct new.agency_id,u.id,c.id,c.location_id,m.ghl_user_id,new.id
 from public.carrier_transactions t join public.users u on u.id=t.user_id and u.agency_id=t.agency_id
 join public.ghl_import_automation_settings a on a.actor_user_id=u.id and a.agency_id=u.agency_id and a.enabled
 join public.ghl_connections c on c.id=a.connection_id and c.agency_id=u.agency_id and c.mode='shared'
 join public.ghl_agent_mappings m on m.connection_id=c.id and m.agency_id=u.agency_id and m.user_id=u.id
 where t.statement_id=new.id and t.agency_id=new.agency_id and t.superseded_at is null and u.active and u.role in ('owner','agent')
 on conflict(statement_id,actor_user_id,connection_id) do nothing;
 return new;
end $$;
revoke all on function public.queue_ghl_after_statement_import() from public,anon,authenticated;

create or replace function public.claim_ghl_import_job(p_job uuid,p_lease uuid) returns jsonb language plpgsql security definer set search_path=public as $$
declare j public.ghl_import_jobs%rowtype;
begin
 if p_lease is null then raise exception 'Lease required'; end if;
 select * into j from public.ghl_import_jobs where id=p_job for update;
 if j.id is null or j.state not in ('queued','running') or j.next_attempt_at>now() or (j.state='running' and j.lease_until>now()) then return null; end if;
 perform pg_advisory_xact_lock(hashtextextended(j.actor_user_id::text||'/'||j.connection_id::text,0));
 if exists(select 1 from public.ghl_import_jobs where actor_user_id=j.actor_user_id and connection_id=j.connection_id and state='running' and id<>j.id) then return null; end if;
 if not exists(select 1 from public.ghl_import_automation_settings a join public.ghl_connections c on c.id=a.connection_id and c.agency_id=a.agency_id join public.ghl_agent_mappings m on m.connection_id=c.id and m.agency_id=c.agency_id and m.user_id=a.actor_user_id join public.users u on u.id=a.actor_user_id and u.agency_id=a.agency_id where a.connection_id=j.connection_id and a.actor_user_id=j.actor_user_id and a.agency_id=j.agency_id and a.enabled and u.active and u.role in ('owner','agent') and c.location_id=j.location_id and m.ghl_user_id=j.ghl_user_id) or not exists(select 1 from public.commission_statements s join public.carrier_transactions t on t.statement_id=s.id and t.agency_id=s.agency_id where s.id=j.statement_id and s.agency_id=j.agency_id and s.status='imported' and s.superseded_at is null and t.user_id=j.actor_user_id and t.superseded_at is null) then
  update public.ghl_import_jobs set state='cancelled',lease_id=null,lease_until=null,last_error='access_changed',updated_at=now() where id=j.id;return null;
 end if;
 if j.attempts>=3 then update public.ghl_import_jobs set state='needs_attention',lease_id=null,lease_until=null,last_error='retry_limit',updated_at=now() where id=j.id;return null;end if;
 update public.ghl_import_jobs set state='running',attempts=attempts+1,lease_id=p_lease,lease_until=now()+interval '30 minutes',last_error=null,updated_at=now() where id=j.id returning * into j;
 return to_jsonb(j);
end $$;
revoke all on function public.claim_ghl_import_job(uuid,uuid) from public,anon,authenticated;
grant execute on function public.claim_ghl_import_job(uuid,uuid) to service_role;
create or replace function public.guard_ghl_statement_contact() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if tg_table_name='ghl_statement_contact_operations' and tg_op='UPDATE' then
  if (old.agency_id,old.actor_user_id,old.connection_id,old.ghl_user_id,old.source_entry_id,old.identity_hash) is distinct from (new.agency_id,new.actor_user_id,new.connection_id,new.ghl_user_id,new.source_entry_id,new.identity_hash) then raise exception 'Contact operation identity is immutable'; end if;
  if old.contact_id is not null and old.contact_id is distinct from new.contact_id then raise exception 'Contact identity cannot be replaced'; end if;
  if not (old.phase=new.phase or (old.phase='prepared' and new.phase in ('create_pending','created')) or (old.phase='create_pending' and new.phase='created') or (old.phase='created' and new.phase='linked')) then raise exception 'Invalid contact operation transition'; end if;
 end if;
 if tg_table_name='ghl_statement_contact_links' and tg_op='UPDATE' then raise exception 'Statement links are append only'; end if;
 if not exists(select 1 from public.users u join public.carrier_transactions t on t.id=new.source_entry_id and t.agency_id=u.agency_id and t.user_id=u.id join public.commission_statements s on s.id=t.statement_id and s.agency_id=u.agency_id where u.id=new.actor_user_id and u.agency_id=new.agency_id and u.role in ('owner','agent') and u.active and t.superseded_at is null and s.status='imported' and s.superseded_at is null) then raise exception 'Current credited producer and original statement required'; end if;
 if not exists(select 1 from public.ghl_connections c join public.ghl_agent_mappings m on m.connection_id=c.id and m.agency_id=c.agency_id where c.id=new.connection_id and c.agency_id=new.agency_id and c.mode='shared' and m.user_id=new.actor_user_id and m.ghl_user_id=new.ghl_user_id) then raise exception 'Current GHL assignment required'; end if;
 if tg_table_name='ghl_statement_contact_links' then
 if not exists(select 1 from public.ghl_statement_contact_operations o where o.id=new.operation_id and o.agency_id=new.agency_id and o.actor_user_id=new.actor_user_id and o.connection_id=new.connection_id and o.ghl_user_id=new.ghl_user_id and o.contact_id=new.contact_id and o.phase in ('created','linked')) then raise exception 'Confirmed contact operation required'; end if;
 end if;
 return new;
end $$;
revoke all on function public.guard_ghl_statement_contact() from public,anon,authenticated;
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
   perform public.assert_ghl_policy_source(p_actor,p_agency,op.source_owner_id,op.source_hash,op.source_code);
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
   perform public.assert_ghl_policy_source(p_actor,p_agency,(p_data->>'ownerId')::uuid,p_data->>'sourceHash',p_data->>'code');
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
