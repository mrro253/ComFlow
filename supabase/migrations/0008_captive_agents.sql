-- Captive / LOA agents (Ryan, 2026-10-10).
--
-- A captive agent writes business under a principal agent. The carrier pays
-- the principal; the principal pays the captive agent outside this app. So:
--  * production written by a captive agent is CREDITED to the principal
--    (carrier_transactions.user_id = principal), and
--  * the captive agent is recorded as the writer (writing_user_id) so they can
--    sign in and see their own production.
--
-- Additive, except that the agent_type check is widened to allow 'captive'.

-- ============================================================================
-- users: captive type + principal
-- ============================================================================

alter table public.users drop constraint if exists users_agent_type_check;
alter table public.users
  add constraint users_agent_type_check
  check (agent_type in ('career', 'independent', 'captive'));

alter table public.users
  add column if not exists principal_id uuid references public.users (id);

alter table public.users drop constraint if exists users_principal_matches_type;
alter table public.users
  add constraint users_principal_matches_type
  check (
    (agent_type is not distinct from 'captive') = (principal_id is not null)
    and principal_id is distinct from id
  );

create index if not exists users_principal_id_idx on public.users (principal_id);

-- The principal must be in the same agency and must not be captive too (no
-- chains), and a user who has captive agents cannot become captive.
create or replace function public.validate_captive_principal()
returns trigger
language plpgsql
as $$
declare
  v_principal record;
begin
  if new.principal_id is not null then
    select agency_id, agent_type, active into v_principal
    from public.users where id = new.principal_id;

    if not found or v_principal.agency_id <> new.agency_id then
      raise exception 'The principal agent must belong to the same agency';
    end if;
    if v_principal.agent_type is not distinct from 'captive' then
      raise exception 'A captive agent cannot be the principal of another captive agent';
    end if;
  end if;

  if new.agent_type is not distinct from 'captive'
     and exists (select 1 from public.users where principal_id = new.id) then
    raise exception 'This user is the principal of captive agents and cannot be captive';
  end if;

  return new;
end;
$$;

drop trigger if exists users_validate_captive_principal on public.users;
create trigger users_validate_captive_principal
  before insert or update on public.users
  for each row execute function public.validate_captive_principal();

-- ============================================================================
-- carrier_transactions: who actually wrote the business
-- ============================================================================

alter table public.carrier_transactions
  add column if not exists writing_user_id uuid references public.users (id);

create index if not exists carrier_transactions_writing_user_idx
  on public.carrier_transactions (writing_user_id)
  where writing_user_id is not null;

-- Same scope as before, plus: a captive agent sees the rows they wrote.
drop policy if exists "carrier_transactions_scoped_select" on public.carrier_transactions;
create policy "carrier_transactions_scoped_select" on public.carrier_transactions
  for select using (
    agency_id = public.get_my_agency_id()
    and (
      public.get_my_role() = 'owner'
      or user_id = auth.uid()
      or writing_user_id = auth.uid()
      or user_id in (select id from public.users where manager_id = auth.uid())
    )
  );

-- ============================================================================
-- import_statement: also records writing_user_id
-- ============================================================================

drop function if exists public.import_statement(uuid, uuid, uuid, text, bigint, bigint, jsonb, uuid[]);

create or replace function public.import_statement(
  p_agency_id uuid,
  p_statement_id uuid,
  p_actor uuid,
  p_statement_month text,
  p_statement_total_cents bigint,
  p_carried_balance_cents bigint,
  p_rows jsonb,
  p_supersedes uuid[] default '{}'
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_inserted integer;
  v_old uuid;
  v_old_status text;
begin
  select status into v_status
  from public.commission_statements
  where id = p_statement_id and agency_id = p_agency_id
  for update;

  if not found then
    raise exception 'Statement not found';
  end if;
  if v_status in ('imported', 'superseded') then
    raise exception 'Statement has already been imported';
  end if;

  -- Retire the statements this one corrects. Nothing is deleted.
  foreach v_old in array coalesce(p_supersedes, '{}'::uuid[]) loop
    if v_old = p_statement_id then
      raise exception 'A statement cannot supersede itself';
    end if;

    select status into v_old_status
    from public.commission_statements
    where id = v_old and agency_id = p_agency_id
    for update;

    if not found then
      raise exception 'Statement to supersede not found';
    end if;
    if v_old_status <> 'imported' then
      raise exception 'Only an imported statement can be superseded';
    end if;
    if exists (
      select 1
      from public.agent_earnings e
      join public.carrier_transactions t on t.id = e.carrier_transaction_id
      where t.statement_id = v_old and t.agency_id = p_agency_id
    ) then
      raise exception 'The statement to supersede already has earnings and cannot be replaced';
    end if;

    update public.carrier_transactions
    set superseded_at = now()
    where statement_id = v_old and agency_id = p_agency_id and superseded_at is null;

    update public.commission_statements
    set status = 'superseded',
        superseded_by = p_statement_id,
        superseded_at = now()
    where id = v_old;

    insert into public.audit_events (agency_id, actor_user_id, action, entity_type, entity_id, details)
    values (
      p_agency_id, p_actor, 'statement.superseded', 'commission_statement',
      v_old::text, jsonb_build_object('superseded_by', p_statement_id)
    );
  end loop;

  insert into public.carrier_transactions (
    agency_id, statement_id, carrier, statement_month, carrier_member_id,
    effective_date, commission_type, amount_cents, transaction_key,
    writing_agent_name, writing_agent_verified, user_id, production_entity_id,
    writing_user_id
  )
  select
    p_agency_id,
    p_statement_id,
    r->>'carrier',
    r->>'statement_month',
    r->>'carrier_member_id',
    (r->>'effective_date')::date,
    r->>'commission_type',
    (r->>'amount_cents')::bigint,
    r->>'transaction_key',
    r->>'writing_agent_name',
    coalesce((r->>'writing_agent_verified')::boolean, false),
    nullif(r->>'user_id', '')::uuid,
    nullif(r->>'production_entity_id', '')::uuid,
    nullif(r->>'writing_user_id', '')::uuid
  from jsonb_array_elements(p_rows) as r;

  get diagnostics v_inserted = row_count;

  update public.commission_statements
  set status = 'imported',
      statement_month = p_statement_month,
      statement_total_cents = p_statement_total_cents,
      carried_balance_cents = p_carried_balance_cents,
      transaction_count = v_inserted,
      imported_by = p_actor,
      imported_at = now(),
      error_message = null
  where id = p_statement_id;

  insert into public.audit_events (agency_id, actor_user_id, action, entity_type, entity_id, details)
  values (
    p_agency_id, p_actor, 'statement.imported', 'commission_statement',
    p_statement_id::text,
    jsonb_build_object(
      'transactions_inserted', v_inserted,
      'statement_month', p_statement_month,
      'supersedes', to_jsonb(coalesce(p_supersedes, '{}'::uuid[]))
    )
  );

  return v_inserted;
end;
$$;

revoke all on function public.import_statement(uuid, uuid, uuid, text, bigint, bigint, jsonb, uuid[]) from public;
grant execute on function public.import_statement(uuid, uuid, uuid, text, bigint, bigint, jsonb, uuid[]) to service_role;
