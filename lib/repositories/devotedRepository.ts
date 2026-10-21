import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { mapUserRow } from "@/lib/repositories/userRepository";
import { buildWritingAgentOwners, withSavedAliases } from "@/lib/carriers/writingAgentOwners";
import { sha256 } from "@/lib/carriers/digest";
import type { DevotedPair } from "@/lib/carriers/devoted/parseDevotedPair";
import type { ImportRowPayload } from "@/lib/carriers/buildStatementPreview";
import type { CurrentUser } from "@/types/domain";
import type { Json } from "@/types/database";

/** Read-only, session-scoped context: preview does not create production entities or aliases. */
export async function loadDevotedContext(agencyId: string, payDate: string, payeeHash: string) {
  const session = await createClient();
  const [users, entities, aliases, prior] = await Promise.all([
    session.from("users").select("*").eq("agency_id", agencyId),
    session.from("production_entities").select("id,entity_type,user_id").eq("agency_id", agencyId),
    session.from("writing_agent_aliases").select("alias,user_id").eq("agency_id", agencyId),
    session.from("commission_statements").select("id,source_pair_hash,statement_pay_date,devoted_payee_hash").eq("agency_id", agencyId).eq("carrier", "Devoted Health").eq("status", "imported").eq("statement_pay_date", payDate).eq("devoted_payee_hash", payeeHash),
  ]);
  if ([users, entities, aliases, prior].some((r) => r.error)) throw new Error("Could not load Devoted review context. The review migration may not be installed.");
  const team = (users.data ?? []).map(mapUserRow);
  const refs = (entities.data ?? []).map((e) => ({ id: e.id, entityType: e.entity_type, userId: e.user_id }));
  const owners = withSavedAliases(buildWritingAgentOwners(team, refs), (aliases.data ?? []).map((a) => ({ alias: a.alias, userId: a.user_id })), team, refs);
  return { owners, prior: (prior.data ?? []).map((p) => ({ id: p.id, pairHash: p.source_pair_hash!, payDate: p.statement_pay_date!, payeeHash: p.devoted_payee_hash! })) };
}

/** Objects first; one RPC registers both sources and imports atomically. No incomplete parent row. */
export async function registerAndImportDevoted(user: CurrentUser, pair: DevotedPair, pdf: Uint8Array, workbook: Uint8Array, rows: ImportRowPayload[], existing: string[], supersedes: string[]) {
  const admin = createAdminClient();
  if (sha256(pdf) !== pair.statement.sourceHash || sha256(workbook) !== pair.workbookHash) throw new Error("Devoted source fingerprints changed");
  for (const source of [{ bytes: pdf, extension: "pdf", mime: "application/pdf" }, { bytes: workbook, extension: "xlsx", mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }]) {
    const path = `${user.agencyId}/devoted/${pair.pairHash}.${source.extension}`;
    const bucket = admin.storage.from("statements");
    // Never overwrite: if an upload reports a conflict, verify the existing object's bytes.
    const upload = await bucket.upload(path, source.bytes, { contentType: source.mime, upsert: false });
    if (upload.error && !["409", "400"].includes(String(upload.error.statusCode))) throw new Error("Could not preserve Devoted sources. Any partial upload remains private for review.");
    const saved = await bucket.download(path);
    if (saved.error || !saved.data || sha256(new Uint8Array(await saved.data.arrayBuffer())) !== sha256(source.bytes)) throw new Error("Stored Devoted source failed fingerprint verification");
  }
  const { data, error } = await admin.rpc("import_devoted_pair", {
    p_agency_id: user.agencyId, p_actor: user.id, p_pdf_hash: pair.statement.sourceHash,
    p_workbook_hash: pair.workbookHash, p_pair_hash: pair.pairHash,
    p_pdf_size: pdf.length, p_workbook_size: workbook.length,
    p_pay_date: pair.payDate, p_payee_hash: pair.payeeHash,
    p_period_start: pair.periodStart, p_period_end: pair.periodEnd,
    p_total_cents: pair.statement.statementTotalCents, p_rows: rows as unknown as Json,
    p_expected_existing: existing, p_supersedes: supersedes, p_parser_version: pair.parserVersion,
  });
  if (error || !data) throw new Error("Devoted import was not completed. Refresh the preview; no partial commission import is allowed.");
  return data;
}

/** Internal source lookup only after a session has authorized a specific transaction. */
export async function loadSavedDevotedPair(agencyId: string, statementId: string) {
  const admin = createAdminClient();
  const { data, error } = await admin.from("commission_statement_sources").select("*").eq("agency_id", agencyId).eq("statement_id", statementId);
  if (error || data?.length !== 2) throw new Error("Missing Devoted paired sources");
  const read = async (kind: string) => {
    const source = data.find((s) => s.source_kind === kind);
    if (!source || !source.storage_path.startsWith(`${agencyId}/devoted/`) || source.storage_path.includes("..")) throw new Error("Invalid Devoted source metadata");
    const { data: blob, error: downloadError } = await admin.storage.from("statements").download(source.storage_path);
    if (downloadError || !blob || blob.size !== source.byte_size) throw new Error("Could not verify Devoted source");
    const bytes = new Uint8Array(await blob.arrayBuffer());
    if (sha256(bytes) !== source.sha256) throw new Error("Devoted source fingerprint mismatch");
    return bytes;
  };
  const [pdf, workbook] = await Promise.all([read("pdf"), read("workbook")]);
  return { pdf, workbook };
}
