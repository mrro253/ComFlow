create table public.ghl_import_automation_settings (
 agency_id uuid not null references public.agencies(id), actor_user_id uuid not null references public.users(id),
 connection_id uuid not null references public.ghl_connections(id) on delete cascade,
 enabled boolean not null default false, updated_at timestamptz not null default now(),
 primary key(actor_user_id,connection_id)
);
create table public.ghl_import_jobs (
 id uuid primary key default gen_random_uuid(), agency_id uuid not null references public.agencies(id),
 actor_user_id uuid not null references public.users(id), connection_id uuid not null,
 location_id text not null, ghl_user_id text not null,
 statement_id uuid not null references public.commission_statements(id),
 state text not null default 'queued' check(state in ('queued','running','completed','needs_attention','cancelled')),
 attempts integer not null default 0 check(attempts>=0), lease_id uuid, lease_until timestamptz,
 next_attempt_at timestamptz not null default now(), summary jsonb not null default '{}'::jsonb, last_error text check(last_error in ('paused','access_changed','disabled','retry_limit')),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(statement_id,actor_user_id,connection_id)
);
create unique index ghl_one_running_import_job on public.ghl_import_jobs(actor_user_id,connection_id) where state='running';
alter table public.ghl_import_automation_settings enable row level security;
alter table public.ghl_import_jobs enable row level security;
revoke all on public.ghl_import_automation_settings,public.ghl_import_jobs from public,anon,authenticated;
grant all on public.ghl_import_automation_settings,public.ghl_import_jobs to service_role;

create function public.queue_ghl_after_statement_import() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if new.status<>'imported' or new.superseded_at is not null then return new; end if;
 if tg_op='UPDATE' then if old.status='imported' then return new; end if; end if;
 insert into public.ghl_import_jobs(agency_id,actor_user_id,connection_id,location_id,ghl_user_id,statement_id)
 select distinct new.agency_id,u.id,c.id,c.location_id,m.ghl_user_id,new.id
 from public.carrier_transactions t join public.users u on u.id=t.user_id and u.agency_id=t.agency_id
 join public.ghl_import_automation_settings a on a.actor_user_id=u.id and a.agency_id=u.agency_id and a.enabled
 join public.ghl_connections c on c.id=a.connection_id and c.agency_id=u.agency_id and c.mode='shared'
 join public.ghl_agent_mappings m on m.connection_id=c.id and m.agency_id=u.agency_id and m.user_id=u.id
 where t.statement_id=new.id and t.agency_id=new.agency_id and t.superseded_at is null and u.active and u.role='owner'
 on conflict(statement_id,actor_user_id,connection_id) do nothing;
 return new;
end $$;
revoke all on function public.queue_ghl_after_statement_import() from public,anon,authenticated;
create trigger queue_ghl_statement_import after insert or update of status on public.commission_statements for each row execute function public.queue_ghl_after_statement_import();

create function public.claim_ghl_import_job(p_job uuid,p_lease uuid) returns jsonb language plpgsql security definer set search_path=public as $$
declare j public.ghl_import_jobs%rowtype;
begin
 if p_lease is null then raise exception 'Lease required'; end if;
 select * into j from public.ghl_import_jobs where id=p_job for update;
 if j.id is null or j.state not in ('queued','running') or j.next_attempt_at>now() or (j.state='running' and j.lease_until>now()) then return null; end if;
 perform pg_advisory_xact_lock(hashtextextended(j.actor_user_id::text||'/'||j.connection_id::text,0));
 if exists(select 1 from public.ghl_import_jobs where actor_user_id=j.actor_user_id and connection_id=j.connection_id and state='running' and id<>j.id) then return null; end if;
 if not exists(select 1 from public.ghl_import_automation_settings a join public.ghl_connections c on c.id=a.connection_id and c.agency_id=a.agency_id join public.ghl_agent_mappings m on m.connection_id=c.id and m.agency_id=c.agency_id and m.user_id=a.actor_user_id join public.users u on u.id=a.actor_user_id and u.agency_id=a.agency_id where a.connection_id=j.connection_id and a.actor_user_id=j.actor_user_id and a.agency_id=j.agency_id and a.enabled and u.active and u.role='owner' and c.location_id=j.location_id and m.ghl_user_id=j.ghl_user_id) or not exists(select 1 from public.commission_statements s join public.carrier_transactions t on t.statement_id=s.id and t.agency_id=s.agency_id where s.id=j.statement_id and s.agency_id=j.agency_id and s.status='imported' and s.superseded_at is null and t.user_id=j.actor_user_id and t.superseded_at is null) then
  update public.ghl_import_jobs set state='cancelled',lease_id=null,lease_until=null,last_error='access_changed',updated_at=now() where id=j.id;return null;
 end if;
 if j.attempts>=3 then update public.ghl_import_jobs set state='needs_attention',lease_id=null,lease_until=null,last_error='retry_limit',updated_at=now() where id=j.id;return null;end if;
 update public.ghl_import_jobs set state='running',attempts=attempts+1,lease_id=p_lease,lease_until=now()+interval '30 minutes',last_error=null,updated_at=now() where id=j.id returning * into j;
 return to_jsonb(j);
end $$;
revoke all on function public.claim_ghl_import_job(uuid,uuid) from public,anon,authenticated;
grant execute on function public.claim_ghl_import_job(uuid,uuid) to service_role;
