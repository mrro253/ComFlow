-- Statement upload + import plumbing (MVP).
--
--  1. Private Storage bucket for statement PDFs. No storage policies are
--     created, so only the service role can read or write objects. Object
--     keys are "<agency_id>/<sha256>.pdf" (never absolute filesystem paths).
--  2. commission_statements.statement_month becomes nullable: statements
--     downloaded from a carrier portal are registered before they are parsed,
--     and the month is filled in when the PDF is previewed/imported.
--  3. carrier_connections.sync_requested_at: the "Sync now" button sets it;
--     the carrier worker (worker/) picks up flagged connections and clears it.
--  4. import_statement(): inserts a statement's new transactions and marks
--     the statement imported in ONE transaction. Any unique-key conflict
--     (duplicate transaction) rolls everything back.

-- ============================================================================
-- Storage bucket (skipped if the storage schema is not present)
-- ============================================================================

do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public)
    values ('statements', 'statements', false)
    on conflict (id) do nothing;
  end if;
end
$$;

-- ============================================================================
-- Schema tweaks
-- ============================================================================

alter table public.commission_statements
  alter column statement_month drop not null;

alter table public.carrier_connections
  add column if not exists sync_requested_at timestamptz;

-- ============================================================================
-- Atomic import
-- ============================================================================

create or replace function public.import_statement(
  p_agency_id uuid,
  p_statement_id uuid,
  p_actor uuid,
  p_statement_month text,
  p_statement_total_cents bigint,
  p_carried_balance_cents bigint,
  p_rows jsonb
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_inserted integer;
begin
  select status into v_status
  from public.commission_statements
  where id = p_statement_id and agency_id = p_agency_id
  for update;

  if not found then
    raise exception 'Statement not found';
  end if;
  if v_status = 'imported' then
    raise exception 'Statement has already been imported';
  end if;

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
    jsonb_build_object('transactions_inserted', v_inserted, 'statement_month', p_statement_month)
  );

  return v_inserted;
end;
$$;

revoke all on function public.import_statement(uuid, uuid, uuid, text, bigint, bigint, jsonb) from public;
grant execute on function public.import_statement(uuid, uuid, uuid, text, bigint, bigint, jsonb) to service_role;
