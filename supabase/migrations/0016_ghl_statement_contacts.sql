-- Private provisioning journal. No imported rows or GHL records are changed here.
create table public.ghl_statement_contact_operations (
 id uuid primary key,
 agency_id uuid not null references public.agencies(id),
 actor_user_id uuid not null references public.users(id),
 connection_id uuid not null,
 ghl_user_id text not null check(ghl_user_id ~ '^[A-Za-z0-9]{6,80}$'),
 source_entry_id uuid not null references public.carrier_transactions(id),
 identity_hash text not null check(identity_hash ~ '^[a-f0-9]{64}$'),
 phase text not null default 'prepared' check(phase in ('prepared','create_pending','created','linked')),
 contact_id text check(contact_id ~ '^[A-Za-z0-9]{6,80}$'),
 lease_id uuid,
 lease_until timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(connection_id,identity_hash)
);
create table public.ghl_statement_contact_links (
 id uuid primary key,
 agency_id uuid not null references public.agencies(id),
 actor_user_id uuid not null references public.users(id),
 connection_id uuid not null,
 ghl_user_id text not null,
 source_entry_id uuid not null references public.carrier_transactions(id),
 source_key text not null check(source_key ~ '^[a-f0-9]{64}$'),
 contact_id text not null check(contact_id ~ '^[A-Za-z0-9]{6,80}$'),
 operation_id uuid not null references public.ghl_statement_contact_operations(id),
 created_at timestamptz not null default now(),
 unique(connection_id,source_key)
);
alter table public.ghl_statement_contact_operations enable row level security;
alter table public.ghl_statement_contact_links enable row level security;
revoke all on public.ghl_statement_contact_operations,public.ghl_statement_contact_links from public,anon,authenticated;
grant all on public.ghl_statement_contact_operations,public.ghl_statement_contact_links to service_role;
create function public.guard_ghl_statement_contact() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if tg_table_name='ghl_statement_contact_operations' and tg_op='UPDATE' then
  if (old.agency_id,old.actor_user_id,old.connection_id,old.ghl_user_id,old.source_entry_id,old.identity_hash) is distinct from (new.agency_id,new.actor_user_id,new.connection_id,new.ghl_user_id,new.source_entry_id,new.identity_hash) then raise exception 'Contact operation identity is immutable'; end if;
  if old.contact_id is not null and old.contact_id is distinct from new.contact_id then raise exception 'Contact identity cannot be replaced'; end if;
  if not (old.phase=new.phase or (old.phase='prepared' and new.phase in ('create_pending','created')) or (old.phase='create_pending' and new.phase='created') or (old.phase='created' and new.phase='linked')) then raise exception 'Invalid contact operation transition'; end if;
 end if;
 if tg_table_name='ghl_statement_contact_links' and tg_op='UPDATE' then raise exception 'Statement links are append only'; end if;
 if not exists(select 1 from public.users u join public.carrier_transactions t on t.id=new.source_entry_id and t.agency_id=u.agency_id and t.user_id=u.id join public.commission_statements s on s.id=t.statement_id and s.agency_id=u.agency_id where u.id=new.actor_user_id and u.agency_id=new.agency_id and u.role='owner' and u.active and t.superseded_at is null and s.status='imported' and s.superseded_at is null) then raise exception 'Current credited owner and original statement required'; end if;
 if not exists(select 1 from public.ghl_connections c join public.ghl_agent_mappings m on m.connection_id=c.id and m.agency_id=c.agency_id where c.id=new.connection_id and c.agency_id=new.agency_id and c.mode='shared' and m.user_id=new.actor_user_id and m.ghl_user_id=new.ghl_user_id) then raise exception 'Current GHL assignment required'; end if;
 if tg_table_name='ghl_statement_contact_links' then
 if not exists(select 1 from public.ghl_statement_contact_operations o where o.id=new.operation_id and o.agency_id=new.agency_id and o.actor_user_id=new.actor_user_id and o.connection_id=new.connection_id and o.ghl_user_id=new.ghl_user_id and o.contact_id=new.contact_id and o.phase in ('created','linked')) then raise exception 'Confirmed contact operation required'; end if;
 end if;
 return new;
end $$;
revoke all on function public.guard_ghl_statement_contact() from public,anon,authenticated;
create trigger guard_statement_contact_operation before insert or update on public.ghl_statement_contact_operations for each row execute function public.guard_ghl_statement_contact();
create trigger guard_statement_contact_link before insert or update on public.ghl_statement_contact_links for each row execute function public.guard_ghl_statement_contact();
