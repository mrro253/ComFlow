import { buildStatementPreview, toImportRows, type StatementPreview } from "@/lib/carriers/buildStatementPreview";
import { getStatementParser } from "@/lib/carriers";
import { planCorrection } from "@/lib/carriers/planCorrection";
import { extractPdfText } from "@/lib/pdf/extractPdfText";
import { getAgencyById } from "@/lib/repositories/agencyRepository";
import {
  downloadStatementPdf,
  findImportedStatementsByFilename,
  importStatementRows,
  listExistingForStatements,
  listExistingTransactions,
  loadWritingAgentContext,
  type StatementRecord,
} from "@/lib/repositories/statementRepository";
import type { CurrentUser } from "@/types/domain";

/**
 * Orchestrates: stored PDF -> text -> carrier parser -> duplicate/assignment
 * preview. Pure business rules live in lib/carriers; this file only wires them
 * to storage and the database. Owner-only: callers must check the role.
 */

export class StatementProcessingError extends Error {}

export async function buildPreviewForStatement(
  user: CurrentUser,
  statement: StatementRecord
): Promise<StatementPreview> {
  if (!statement.storagePath) throw new StatementProcessingError("This statement has no stored PDF");

  const parser = getStatementParser(statement.carrier);
  if (!parser) throw new StatementProcessingError(`${statement.carrier} statements are not supported yet`);

  const pdf = await extractPdfText(await downloadStatementPdf(statement.storagePath));
  if (pdf.sha256 !== statement.fileHash) {
    throw new StatementProcessingError("The stored PDF does not match its recorded fingerprint");
  }

  let parsed;
  try {
    // Parsers throw when totals do not reconcile instead of returning partial data.
    parsed = parser.parse(pdf.text, pdf.sha256);
  } catch (err) {
    throw new StatementProcessingError(
      err instanceof Error ? err.message : "The statement could not be read"
    );
  }

  const agency = await getAgencyById(user.agencyId);
  const [context, liveExisting, sameNamed] = await Promise.all([
    loadWritingAgentContext(user.agencyId, agency?.name ?? "Agency"),
    listExistingTransactions(user.agencyId, parsed.carrier, parsed.statementMonth),
    findImportedStatementsByFilename({
      agencyId: user.agencyId,
      carrier: parsed.carrier,
      statementMonth: parsed.statementMonth,
      userId: statement.userId,
      filename: statement.originalFilename,
      excludeStatementId: statement.id,
    }),
  ]);

  // Same file name as an earlier import: identical payments are a duplicate; mostly
  // the same payments mean this is the corrected version, which replaces the old one.
  const priorRows = await listExistingForStatements(
    user.agencyId,
    sameNamed.map((s) => s.id)
  );
  const correction = planCorrection(
    parsed.transactions,
    sameNamed.map((s) => ({
      id: s.id,
      filename: s.originalFilename,
      transactions: priorRows.get(s.id) ?? [],
    }))
  );
  // The statements being replaced no longer count when checking for duplicates.
  const replacedRowIds = new Set(
    correction.kind === "supersede"
      ? correction.replaces.flatMap((r) => (priorRows.get(r.id) ?? []).map((t) => t.id))
      : []
  );
  const existing = liveExisting.filter((row) => !replacedRowIds.has(row.id));

  // An Independent agent's own statement belongs entirely to them.
  const statementOwner = statement.userId
    ? context.users.find((u) => u.id === statement.userId && u.agentType === "independent" && u.role !== "owner")
    : undefined;
  const forced = statementOwner
    ? { userId: statementOwner.id, agentType: statementOwner.agentType, productionEntityId: null, entityType: null }
    : null;

  return buildStatementPreview(parsed, context.owners, existing, forced, correction);
}

/**
 * Re-builds the preview on the server (never trusting the browser) and imports
 * it atomically. Returns the number of transactions inserted.
 */
export async function importStatement(user: CurrentUser, statement: StatementRecord): Promise<number> {
  if (statement.status === "imported" || statement.status === "superseded") {
    throw new StatementProcessingError("This statement has already been imported");
  }
  const preview = await buildPreviewForStatement(user, statement);
  if (!preview.canImport) {
    throw new StatementProcessingError(preview.blockers.join(" "));
  }

  return importStatementRows({
    agencyId: user.agencyId,
    statementId: statement.id,
    actorId: user.id,
    statementMonth: preview.statement.statementMonth,
    statementTotalCents: preview.statement.statementTotalCents,
    carriedBalanceCents: preview.statement.carriedBalanceCents,
    rows: toImportRows(preview),
    supersedes:
      preview.correction.kind === "supersede" ? preview.correction.replaces.map((r) => r.id) : [],
  });
}
