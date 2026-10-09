import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../types/database";
import { sha256Hex } from "./safeError.js";

export type Db = SupabaseClient<Database>;
export type ConnectionRow = Database["public"]["Tables"]["carrier_connections"]["Row"];

const BUCKET = "statements";

export function createDb(): Db {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
  return createClient<Database>(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** Connections with a pending "Sync now" request. */
export async function listRequestedConnectionIds(db: Db): Promise<string[]> {
  const { data, error } = await db
    .from("carrier_connections")
    .select("id")
    .not("sync_requested_at", "is", null)
    .neq("status", "disabled");
  if (error) throw new Error(`Could not list sync requests: ${error.message}`);
  return (data ?? []).map((row) => row.id);
}

/** Atomically takes a sync request so two workers never run the same connection. */
export async function claimConnection(db: Db, id: string): Promise<ConnectionRow | null> {
  const { data, error } = await db
    .from("carrier_connections")
    .update({ sync_requested_at: null, last_sync_at: new Date().toISOString() })
    .eq("id", id)
    .not("sync_requested_at", "is", null)
    .neq("status", "disabled")
    .select("*")
    .maybeSingle();
  if (error) throw new Error(`Could not claim connection: ${error.message}`);
  return data;
}

export async function loadCiphertext(db: Db, connectionId: string): Promise<string | null> {
  const { data } = await db.from("carrier_credentials").select("ciphertext").eq("connection_id", connectionId).maybeSingle();
  return data?.ciphertext ?? null;
}

export async function loadStatementOwner(db: Db, userId: string) {
  const { data } = await db.from("users").select("id, role, agent_type").eq("id", userId).maybeSingle();
  return data;
}

export async function knownStatementIds(db: Db, connectionId: string): Promise<Set<string>> {
  const { data } = await db
    .from("commission_statements")
    .select("carrier_statement_id")
    .eq("connection_id", connectionId)
    .not("carrier_statement_id", "is", null);
  return new Set((data ?? []).map((row) => row.carrier_statement_id as string));
}

export interface StoredStatement {
  agencyId: string;
  connectionId: string;
  carrier: string;
  statementOwnerUserId: string | null;
  carrierStatementId: string;
  filename: string;
  pdf: Buffer;
}

/** Stores the PDF privately and registers it for the owner's review. Idempotent by file hash. */
export async function storeStatement(db: Db, input: StoredStatement): Promise<"stored" | "duplicate"> {
  if (input.pdf.subarray(0, 5).toString() !== "%PDF-") throw new Error("Downloaded content is not a PDF");
  const fileHash = sha256Hex(input.pdf);

  const { data: existing } = await db
    .from("commission_statements")
    .select("id, carrier_statement_id")
    .eq("agency_id", input.agencyId)
    .eq("file_hash", fileHash)
    .maybeSingle();

  if (existing) {
    // Same PDF was uploaded by hand earlier: link it so we stop re-downloading it.
    if (!existing.carrier_statement_id) {
      await db
        .from("commission_statements")
        .update({ connection_id: input.connectionId, carrier_statement_id: input.carrierStatementId })
        .eq("id", existing.id);
    }
    return "duplicate";
  }

  const path = `${input.agencyId}/${fileHash}.pdf`;
  const { error: uploadError } = await db.storage.from(BUCKET).upload(path, input.pdf, {
    contentType: "application/pdf",
    upsert: false,
  });
  if (uploadError && !/already exists|Duplicate/i.test(uploadError.message)) {
    throw new Error(`Could not store the PDF: ${uploadError.message}`);
  }

  const { error } = await db.from("commission_statements").insert({
    agency_id: input.agencyId,
    user_id: input.statementOwnerUserId,
    connection_id: input.connectionId,
    carrier: input.carrier,
    source: "portal",
    carrier_statement_id: input.carrierStatementId,
    original_filename: input.filename.slice(0, 200),
    storage_path: path,
    file_hash: fileHash,
    status: "received",
  });
  if (error) throw new Error(`Could not register the statement: ${error.message}`);
  return "stored";
}

export async function markConnection(
  db: Db,
  id: string,
  result: { ok: true; warning?: string } | { ok: false; error: string }
): Promise<void> {
  const now = new Date().toISOString();
  const update =
    result.ok && !result.warning
      ? { status: "active" as const, last_error: null, last_successful_sync_at: now, last_sync_at: now }
      : result.ok
        ? { status: "needs_attention" as const, last_error: result.warning ?? null, last_successful_sync_at: now, last_sync_at: now }
        : { status: "needs_attention" as const, last_error: result.error, last_sync_at: now };
  await db.from("carrier_connections").update(update).eq("id", id);
}
