-- Statement review improvements (Ryan's 2026-10-10 answers).
--
--  1. Corrected statements: a statement can be SUPERSEDED by a later corrected
--     version. Superseded statements and their transactions stay in the
--     database (viewable) but are excluded from reporting
--     (carrier_transactions.superseded_at is not null).
--  2. users.payee_id: the carrier's agent number (for example Ultimate's W####)
--     used to tell apart two people who share a name on a statement.
--  3. import_statement() can atomically supersede earlier statements while it
--     imports the corrected one.
--
-- Additive only: no existing column or row is changed or dropped.

-- ============================================================================
-- Superseded statements
-- ============================================================================

alter table public.commission_statements
  drop constraint if exists commission_statements_status_check;
alter table public.commission_statements
  add constraint commission_statements_status_check
  check (status in ('received', 'previewed', 'imported', 'failed', 'superseded'));

alter table public.commission_statements
  add column if not exists superseded_by uuid references public.commission_statements (id),
  add column if not exists superseded_at timestamptz;

alter table public.carrier_transactions
  add column if not exists superseded_at timestamptz;

-- Reporting reads only live rows.
create index if not exists carrier_transactions_live_month_idx
  on public.carrier_transactions (agency_id, statement_month)
  where superseded_at is null;

-- Finds earlier statements with the same file name.
create index if not exists commission_statements_filename_idx
  on public.commission_statements (agency_id, carrier, lower(btrim(original_filename)));

-- ============================================================================
-- Carrier agent number on users
-- ============================================================================

alter table public.users
  add column if not exists payee_id text
    check (payee_id is null or (payee_id = upper(btrim(payee_id)) and payee_id <> ''));

create unique index if not exists users_agency_payee_id_key
  on public.users (agency_id, payee_id)
  where payee_id is not null;

-- ============================================================================
-- Atomic import (now able to supersede earlier statements)
-- ============================================================================

drop function if exists public.import_statement(uuid, uuid, uuid, text, bigint, bigint, jsonb);

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
    writing_agent_name, writing_agent_verified, user_id, production_entity_id
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
    nullif(r->>'production_entity_id', '')::uuid
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
