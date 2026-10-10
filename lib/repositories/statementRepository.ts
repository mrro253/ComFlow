import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { mapUserRow } from "@/lib/repositories/userRepository";
import type { ExistingTransaction } from "@/lib/carriers/planStatementImport";
import type { ImportRowPayload } from "@/lib/carriers/buildStatementPreview";
import {
  buildWritingAgentOwners,
  withSavedAliases,
  type ProductionEntityRef,
} from "@/lib/carriers/writingAgentOwners";
import {
  normalizeWritingAgentName,
  type WritingAgentIndex,
} from "@/lib/carriers/classifyWritingAgent";
import { normalizeFilename } from "@/lib/carriers/planCorrection";
import type { Database, Json } from "@/types/database";
import type { AppUser } from "@/types/domain";

/**
 * Database layer for carrier statements and the transaction ledger.
 *
 * Reads that are shown to the signed-in user use the session client so Row
 * Level Security scopes them. Writes use the service-role client because the
 * financial tables are not writable by `authenticated`; every caller must have
 * checked the user's role first (see the server actions).
 */

export const STATEMENT_BUCKET = "statements";

type StatementRow = Database["public"]["Tables"]["commission_statements"]["Row"];
type TransactionRow = Database["public"]["Tables"]["carrier_transactions"]["Row"];

export interface StatementRecord {
  id: string;
  /** Whose statement this is: an Independent agent's own, or null for the agency's. */
  userId: string | null;
  carrier: string;
  statementMonth: string | null;
  source: "upload" | "portal";
  originalFilename: string | null;
  storagePath: string | null;
  fileHash: string;
  statementTotalCents: number | null;
  carriedBalanceCents: number | null;
  transactionCount: number | null;
  status: StatementRow["status"];
  errorMessage: string | null;
  createdAt: string;
  importedAt: string | null;
  /** The corrected statement that replaced this one, when status is "superseded". */
  supersededBy: string | null;
  supersededAt: string | null;
}

function mapStatement(row: StatementRow): StatementRecord {
  return {
    id: row.id,
    userId: row.user_id,
    carrier: row.carrier,
    statementMonth: row.statement_month,
    source: row.source,
    originalFilename: row.original_filename,
    storagePath: row.storage_path,
    fileHash: row.file_hash,
    statementTotalCents: row.statement_total_cents,
    carriedBalanceCents: row.carried_balance_cents,
    transactionCount: row.transaction_count,
    status: row.status,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    importedAt: row.imported_at,
    supersededBy: row.superseded_by,
    supersededAt: row.superseded_at,
  };
}

export interface CarrierTransactionRecord {
  id: string;
  statementId: string;
  carrier: string;
  statementMonth: string;
  memberId: string;
  effectiveDate: string;
  commissionType: string;
  amountCents: number;
  writingAgentName: string | null;
  writingAgentVerified: boolean;
  userId: string | null;
}

function mapTransaction(row: TransactionRow): CarrierTransactionRecord {
  return {
    id: row.id,
    statementId: row.statement_id,
    carrier: row.carrier,
    statementMonth: row.statement_month,
    memberId: row.carrier_member_id,
    effectiveDate: row.effective_date,
    commissionType: row.commission_type,
    amountCents: row.amount_cents,
    writingAgentName: row.writing_agent_name,
    writingAgentVerified: row.writing_agent_verified,
    userId: row.user_id,
  };
}

// ---------------------------------------------------------------------------
// Statements
// ---------------------------------------------------------------------------

export async function listStatements(limit = 100): Promise<StatementRecord[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("commission_statements")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error || !data) return [];
  return data.map(mapStatement);
}

export async function getStatement(id: string): Promise<StatementRecord | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("commission_statements")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return null;
  return mapStatement(data);
}

/** Statements that this statement replaced (shown on the corrected statement's page). */
export async function listStatementsSupersededBy(statementId: string): Promise<StatementRecord[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("commission_statements")
    .select("*")
    .eq("superseded_by", statementId)
    .order("created_at", { ascending: false });
  if (error || !data) return [];
  return data.map(mapStatement);
}

/**
 * Imported statements that could be the earlier copy of a new statement: same
 * carrier, month and owner, and the same file name (case-insensitive).
 */
export async function findImportedStatementsByFilename(input: {
  agencyId: string;
  carrier: string;
  statementMonth: string;
  /** Null for the agency's own statements. */
  userId: string | null;
  filename: string | null;
  excludeStatementId: string;
}): Promise<StatementRecord[]> {
  const wanted = normalizeFilename(input.filename);
  if (!wanted) return [];

  const admin = createAdminClient();
  let query = admin
    .from("commission_statements")
    .select("*")
    .eq("agency_id", input.agencyId)
    .eq("carrier", input.carrier)
    .eq("statement_month", input.statementMonth)
    .eq("status", "imported")
    .neq("id", input.excludeStatementId);
  query = input.userId ? query.eq("user_id", input.userId) : query.is("user_id", null);

  const { data, error } = await query;
  if (error || !data) throw new Error(error?.message ?? "Could not look up earlier statements");
  return data.map(mapStatement).filter((s) => normalizeFilename(s.originalFilename) === wanted);
}

export async function findStatementByHash(
  agencyId: string,
  fileHash: string
): Promise<StatementRecord | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("commission_statements")
    .select("*")
    .eq("agency_id", agencyId)
    .eq("file_hash", fileHash)
    .maybeSingle();
  return data ? mapStatement(data) : null;
}

export async function insertStatement(input: {
  agencyId: string;
  carrier: string;
  /** Independent agent the statement belongs to; null for the agency's own. */
  userId: string | null;
  fileHash: string;
  originalFilename: string | null;
  storagePath: string;
  uploadedBy: string;
}): Promise<StatementRecord> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("commission_statements")
    .insert({
      agency_id: input.agencyId,
      carrier: input.carrier,
      user_id: input.userId,
      source: "upload",
      file_hash: input.fileHash,
      original_filename: input.originalFilename,
      storage_path: input.storagePath,
      uploaded_by: input.uploadedBy,
      status: "received",
    })
    .select("*")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Could not save the statement");
  return mapStatement(data);
}

export async function uploadStatementPdf(
  agencyId: string,
  fileHash: string,
  bytes: Uint8Array
): Promise<string> {
  const admin = createAdminClient();
  const path = `${agencyId}/${fileHash}.pdf`;
  const { error } = await admin.storage
    .from(STATEMENT_BUCKET)
    .upload(path, bytes, { contentType: "application/pdf", upsert: false });
  // The same content may already be stored (e.g. a retry); identical bytes are safe to reuse.
  if (error && !/already exists|Duplicate/i.test(error.message)) {
    throw new Error(`Could not store the PDF: ${error.message}`);
  }
  return path;
}

export async function downloadStatementPdf(path: string): Promise<Uint8Array> {
  const admin = createAdminClient();
  const { data, error } = await admin.storage.from(STATEMENT_BUCKET).download(path);
  if (error || !data) throw new Error("Could not read the stored PDF");
  return new Uint8Array(await data.arrayBuffer());
}

/** Atomic insert of new rows + mark imported (see migration 0006). Returns rows inserted. */
export async function importStatementRows(input: {
  agencyId: string;
  statementId: string;
  actorId: string;
  statementMonth: string;
  statementTotalCents: number;
  carriedBalanceCents: number;
  rows: ImportRowPayload[];
  /** Earlier statements this one corrects; they are marked superseded in the same transaction. */
  supersedes?: string[];
}): Promise<number> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("import_statement", {
    p_agency_id: input.agencyId,
    p_statement_id: input.statementId,
    p_actor: input.actorId,
    p_statement_month: input.statementMonth,
    p_statement_total_cents: input.statementTotalCents,
    p_carried_balance_cents: input.carriedBalanceCents,
    p_rows: input.rows as unknown as Json,
    p_supersedes: input.supersedes ?? [],
  });
  if (error) throw new Error(error.message);
  return data ?? 0;
}

// ---------------------------------------------------------------------------
// Transactions
// ---------------------------------------------------------------------------

const PAGE_SIZE = 1000; // Supabase's default API row cap: larger limits are silently truncated.
const MAX_ROWS = 50_000; // Safety valve; TODO: aggregate in SQL once volumes grow.

/**
 * Ledger rows for one carrier + statement month, for duplicate detection. Pages
 * through everything: a silently short list would weaken double-count protection.
 */
export async function listExistingTransactions(
  agencyId: string,
  carrier: string,
  statementMonth: string
): Promise<ExistingTransaction[]> {
  const admin = createAdminClient();
  const rows: ExistingTransaction[] = [];
  for (let from = 0; from < MAX_ROWS; from += PAGE_SIZE) {
    const { data, error } = await admin
      .from("carrier_transactions")
      .select("id, transaction_key, carrier, statement_month, carrier_member_id, commission_type, amount_cents")
      .eq("agency_id", agencyId)
      .eq("carrier", carrier)
      .eq("statement_month", statementMonth)
      .is("superseded_at", null)
      .order("id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error || !data) throw new Error(error?.message ?? "Could not load existing transactions");
    rows.push(
      ...data.map((row) => ({
        id: row.id,
        transactionKey: row.transaction_key,
        carrier: row.carrier,
        statementMonth: row.statement_month,
        memberId: row.carrier_member_id,
        type: row.commission_type,
        amountCents: row.amount_cents,
      }))
    );
    if (data.length < PAGE_SIZE) return rows;
  }
  throw new Error("Too many existing transactions to check for duplicates");
}

/** Live ledger rows of the given statements, grouped by statement id (for correction detection). */
export async function listExistingForStatements(
  agencyId: string,
  statementIds: readonly string[]
): Promise<Map<string, ExistingTransaction[]>> {
  const result = new Map<string, ExistingTransaction[]>(statementIds.map((id) => [id, []]));
  if (statementIds.length === 0) return result;

  const admin = createAdminClient();
  for (let from = 0; from < MAX_ROWS; from += PAGE_SIZE) {
    const { data, error } = await admin
      .from("carrier_transactions")
      .select("id, statement_id, transaction_key, carrier, statement_month, carrier_member_id, commission_type, amount_cents")
      .eq("agency_id", agencyId)
      .in("statement_id", [...statementIds])
      .is("superseded_at", null)
      .order("id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error || !data) throw new Error(error?.message ?? "Could not load earlier statement rows");
    for (const row of data) {
      result.get(row.statement_id)?.push({
        id: row.id,
        transactionKey: row.transaction_key,
        carrier: row.carrier,
        statementMonth: row.statement_month,
        memberId: row.carrier_member_id,
        type: row.commission_type,
        amountCents: row.amount_cents,
      });
    }
    if (data.length < PAGE_SIZE) return result;
  }
  throw new Error("Too many rows on earlier statements to compare");
}

/**
 * Everything the signed-in user may see (RLS scopes it), newest statement month
 * first. Pages through results so dashboard totals are never silently truncated.
 */
export async function listVisibleTransactions(): Promise<CarrierTransactionRecord[]> {
  const supabase = await createClient();
  const rows: CarrierTransactionRecord[] = [];
  for (let from = 0; from < MAX_ROWS; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("carrier_transactions")
      .select("*")
      // Superseded statements stay viewable but are never reported.
      .is("superseded_at", null)
      .order("statement_month", { ascending: false })
      .order("effective_date", { ascending: false })
      .order("id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error("Could not load payments");
    rows.push(...(data ?? []).map(mapTransaction));
    if (!data || data.length < PAGE_SIZE) return rows;
  }
  throw new Error("Too many payments to load at once; narrow the view");
}

export async function listTransactionsForStatement(
  statementId: string,
  limit = 1000
): Promise<CarrierTransactionRecord[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("carrier_transactions")
    .select("*")
    .eq("statement_id", statementId)
    .order("effective_date", { ascending: true })
    .limit(limit);
  if (error || !data) return [];
  return data.map(mapTransaction);
}

// ---------------------------------------------------------------------------
// Production entities + writing-agent ownership
// ---------------------------------------------------------------------------

/**
 * Makes sure the agency entity and the Owner's personal entity exist (created on
 * first use). Matched by type/owner rather than name so seeded or renamed
 * entities are reused, never duplicated.
 */
export async function ensureProductionEntities(
  agencyId: string,
  agencyName: string,
  owner: Pick<AppUser, "id" | "firstName" | "lastName">
): Promise<ProductionEntityRef[]> {
  const admin = createAdminClient();
  const load = async (): Promise<ProductionEntityRef[]> => {
    const { data, error } = await admin
      .from("production_entities")
      .select("id, entity_type, user_id")
      .eq("agency_id", agencyId);
    if (error || !data) throw new Error(error?.message ?? "Could not load production entities");
    return data.map((row) => ({ id: row.id, entityType: row.entity_type, userId: row.user_id }));
  };

  let entities = await load();
  const missing: Database["public"]["Tables"]["production_entities"]["Insert"][] = [];
  if (!entities.some((e) => e.entityType === "agency")) {
    missing.push({ agency_id: agencyId, name: agencyName, entity_type: "agency" });
  }
  if (!entities.some((e) => e.entityType === "personal" && e.userId === owner.id)) {
    missing.push({
      agency_id: agencyId,
      name: `${owner.firstName} ${owner.lastName} (personal)`,
      entity_type: "personal",
      user_id: owner.id,
    });
  }
  if (missing.length > 0) {
    // ignoreDuplicates covers a concurrent request creating the same row.
    await admin.from("production_entities").upsert(missing, { onConflict: "agency_id,name", ignoreDuplicates: true });
    entities = await load();
  }
  return entities;
}

export interface WritingAgentContext {
  owners: WritingAgentIndex;
  users: AppUser[];
  entities: ProductionEntityRef[];
}

/** Who each statement name maps to, derived from the team plus any saved aliases. */
export async function loadWritingAgentContext(
  agencyId: string,
  agencyName: string
): Promise<WritingAgentContext> {
  const admin = createAdminClient();
  const { data: userRows, error } = await admin.from("users").select("*").eq("agency_id", agencyId);
  if (error || !userRows) throw new Error(error?.message ?? "Could not load the team");
  const users = userRows.map(mapUserRow);
  const owner = users.find((u) => u.role === "owner");
  if (!owner) throw new Error("This agency has no owner");

  const entities = await ensureProductionEntities(agencyId, agencyName, owner);
  const { data: aliasRows } = await admin
    .from("writing_agent_aliases")
    .select("alias, user_id")
    .eq("agency_id", agencyId);

  const derived = buildWritingAgentOwners(users, entities);
  const owners = withSavedAliases(
    derived,
    (aliasRows ?? []).map((row) => ({ alias: row.alias, userId: row.user_id })),
    users,
    entities
  );
  return { owners, users, entities };
}

export class AssignmentError extends Error {}

/**
 * Manually assigns a carrier transaction to a team member. Optionally remembers
 * the printed writing-agent name as an alias and applies the same assignment to
 * every other unassigned row carrying that exact name.
 */
export async function assignTransaction(input: {
  agencyId: string;
  actorId: string;
  transactionId: string;
  user: AppUser;
  productionEntityId: string | null;
  rememberAlias: boolean;
}): Promise<number> {
  const admin = createAdminClient();
  const { data: tx } = await admin
    .from("carrier_transactions")
    .select("id, writing_agent_name, user_id")
    .eq("id", input.transactionId)
    .eq("agency_id", input.agencyId)
    .maybeSingle();
  if (!tx) throw new AssignmentError("Transaction not found");

  const { data: earning } = await admin
    .from("agent_earnings")
    .select("id")
    .eq("carrier_transaction_id", tx.id)
    .limit(1);
  if (earning && earning.length > 0) {
    throw new AssignmentError("This payment already has an earning and can no longer be reassigned");
  }

  const ids = [tx.id];
  if (input.rememberAlias && tx.writing_agent_name) {
    const { data: siblings } = await admin
      .from("carrier_transactions")
      .select("id")
      .eq("agency_id", input.agencyId)
      .eq("writing_agent_name", tx.writing_agent_name)
      .is("user_id", null);
    for (const sibling of siblings ?? []) if (sibling.id !== tx.id) ids.push(sibling.id);

    await admin.from("writing_agent_aliases").upsert(
      {
        agency_id: input.agencyId,
        user_id: input.user.id,
        alias: normalizeWritingAgentName(tx.writing_agent_name),
      },
      { onConflict: "agency_id,alias", ignoreDuplicates: true }
    );
  }

  const { error } = await admin
    .from("carrier_transactions")
    .update({ user_id: input.user.id, production_entity_id: input.productionEntityId })
    .in("id", ids)
    .eq("agency_id", input.agencyId);
  if (error) throw new AssignmentError(error.message);

  await admin.from("audit_events").insert({
    agency_id: input.agencyId,
    actor_user_id: input.actorId,
    action: "transaction.assigned",
    entity_type: "carrier_transaction",
    entity_id: tx.id,
    details: { assigned_to: input.user.id, rows: ids.length, remembered_alias: input.rememberAlias },
  });
  return ids.length;
}

/**
 * Remembers that a printed writing-agent name belongs to a teammate, so future
 * statements assign automatically. An explicit choice replaces an older alias.
 */
export async function saveWritingAgentAlias(input: {
  agencyId: string;
  actorId: string;
  name: string;
  userId: string;
}): Promise<void> {
  const admin = createAdminClient();
  const alias = normalizeWritingAgentName(input.name);
  const { error } = await admin
    .from("writing_agent_aliases")
    .upsert(
      { agency_id: input.agencyId, user_id: input.userId, alias },
      { onConflict: "agency_id,alias" }
    );
  if (error) throw new Error(error.message);
  await recordAuditEvent({
    agencyId: input.agencyId,
    actorId: input.actorId,
    action: "writing_agent_alias.saved",
    entityType: "user",
    entityId: input.userId,
    details: { alias },
  });
}

/** Appends to the audit trail (service role; the table is append-only). */
export async function recordAuditEvent(input: {
  agencyId: string;
  actorId: string;
  action: string;
  entityType: string;
  entityId: string;
  details?: Json;
}): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin.from("audit_events").insert({
    agency_id: input.agencyId,
    actor_user_id: input.actorId,
    action: input.action,
    entity_type: input.entityType,
    entity_id: input.entityId,
    details: input.details ?? {},
  });
  if (error) throw new Error(error.message);
}
