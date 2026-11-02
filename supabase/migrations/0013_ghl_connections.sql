-- GHL setup only. No contact reads/writes, commission changes or scheduled CRM jobs.
create table public.ghl_connections (
 id uuid primary key,
 agency_id uuid not null references public.agencies(id) on delete cascade,
 user_id uuid not null references public.users(id) on delete cascade,
 mode text not null check(mode in ('personal','shared')),
 location_id text not null check(location_id ~ '^[A-Za-z0-9]{6,80}$'),
 location_name text not null check(length(location_name) between 1 and 200),
 verified_at timestamptz not null default now(),
 created_at timestamptz not null default now()
);
create unique index ghl_personal_slot on public.ghl_connections(agency_id,user_id) where mode='personal';
create unique index ghl_shared_slot on public.ghl_connections(agency_id) where mode='shared';
create table public.ghl_credentials (
 connection_id uuid primary key references public.ghl_connections(id) on delete cascade,
 ciphertext text not null check(ciphertext like 'v1.%')
);
create table public.ghl_agent_mappings (
 connection_id uuid not null references public.ghl_connections(id) on delete cascade,
 agency_id uuid not null references public.agencies(id) on delete cascade,
 user_id uuid not null references public.users(id) on delete cascade,
 ghl_user_id text not null check(ghl_user_id ~ '^[A-Za-z0-9]{6,80}$'),
 verified_at timestamptz not null default now(),
 primary key(connection_id,user_id), unique(connection_id,ghl_user_id)
);
alter table public.ghl_connections enable row level security;
alter table public.ghl_credentials enable row level security;
alter table public.ghl_agent_mappings enable row level security;
revoke all on public.ghl_connections,public.ghl_credentials,public.ghl_agent_mappings from public,anon,authenticated;
grant select on public.ghl_connections,public.ghl_agent_mappings to authenticated;
grant all on public.ghl_connections,public.ghl_credentials,public.ghl_agent_mappings to service_role;
create policy ghl_connection_self_or_shared_owner on public.ghl_connections for select to authenticated using(
 agency_id=public.get_my_agency_id() and ((mode='personal' and user_id=auth.uid()) or (mode='shared' and (public.get_my_role()='owner' or exists(select 1 from public.ghl_agent_mappings m where m.connection_id=ghl_connections.id and m.user_id=auth.uid()))))
);
create policy ghl_mapping_self_or_owner on public.ghl_agent_mappings for select to authenticated using(
 agency_id=public.get_my_agency_id() and (user_id=auth.uid() or public.get_my_role()='owner')
);

-- Atomic credential/config/audit mutations; invoked only after server-side verification.
create function public.manage_ghl_connection(p_actor uuid,p_agency uuid,p_action text,p_data jsonb)
returns void language plpgsql security definer set search_path=public as $$
declare actor_role text; c public.ghl_connections%rowtype; v_mode text; v_user uuid;
begin
 select role into actor_role from public.users where id=p_actor and agency_id=p_agency and active=true for update;
 if actor_role is null then raise exception 'Active account required'; end if;
 if p_action='save' then
   v_mode=p_data->>'mode';
   if v_mode not in ('personal','shared') or v_mode is null or (v_mode='shared' and actor_role<>'owner') then raise exception 'Connection access denied'; end if;
   delete from public.ghl_connections where agency_id=p_agency and mode=v_mode and (v_mode='shared' or user_id=p_actor);
   insert into public.ghl_connections(id,agency_id,user_id,mode,location_id,location_name)
    values((p_data->>'id')::uuid,p_agency,p_actor,v_mode,p_data->>'locationId',p_data->>'locationName');
   insert into public.ghl_credentials(connection_id,ciphertext) values((p_data->>'id')::uuid,p_data->>'ciphertext');
 else
   select * into c from public.ghl_connections where id=(p_data->>'id')::uuid and agency_id=p_agency for update;
   if c.id is null or (c.mode='personal' and c.user_id<>p_actor) or (c.mode='shared' and actor_role<>'owner') then raise exception 'Connection access denied'; end if;
   if p_action='disconnect' then
     delete from public.ghl_connections where id=c.id;
   elsif p_action in ('map','unmap') then
     if c.mode<>'shared' or actor_role<>'owner' then raise exception 'Shared mapping requires owner'; end if;
     v_user=(p_data->>'userId')::uuid;
     if not exists(select 1 from public.users where id=v_user and agency_id=p_agency and active=true) then raise exception 'Active teammate required'; end if;
     if p_action='unmap' then delete from public.ghl_agent_mappings where connection_id=c.id and user_id=v_user;
     else insert into public.ghl_agent_mappings(connection_id,agency_id,user_id,ghl_user_id)
       values(c.id,p_agency,v_user,p_data->>'ghlUserId') on conflict(connection_id,user_id) do update set ghl_user_id=excluded.ghl_user_id,verified_at=now();
     end if;
   else raise exception 'Unknown setup action'; end if;
 end if;
 insert into public.audit_events(agency_id,actor_user_id,action,entity_type,entity_id,details)
 values(p_agency,p_actor,'ghl.setup.'||p_action,'ghl_connection',p_data->>'id','{}'::jsonb);
end $$;
revoke all on function public.manage_ghl_connection(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.manage_ghl_connection(uuid,uuid,text,jsonb) to service_role;
