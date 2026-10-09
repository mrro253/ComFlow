import { buildStatementPreview, toImportRows, type StatementPreview } from "@/lib/carriers/buildStatementPreview";
import { getStatementParser } from "@/lib/carriers";
import { extractPdfText } from "@/lib/pdf/extractPdfText";
import { getAgencyById } from "@/lib/repositories/agencyRepository";
import {
  downloadStatementPdf,
  importStatementRows,
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
  const [context, existing] = await Promise.all([
    loadWritingAgentContext(user.agencyId, agency?.name ?? "Agency"),
    listExistingTransactions(user.agencyId, parsed.carrier, parsed.statementMonth),
  ]);

  // An Independent agent's own statement belongs entirely to them.
  const statementOwner = statement.userId
    ? context.users.find((u) => u.id === statement.userId && u.agentType === "independent" && u.role !== "owner")
    : undefined;
  const forced = statementOwner
    ? { userId: statementOwner.id, agentType: statementOwner.agentType, productionEntityId: null, entityType: null }
    : null;

  return buildStatementPreview(parsed, context.owners, existing, forced);
}

/**
 * Re-builds the preview on the server (never trusting the browser) and imports
 * it atomically. Returns the number of transactions inserted.
 */
export async function importStatement(user: CurrentUser, statement: StatementRecord): Promise<number> {
  if (statement.status === "imported") {
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
  });
}
