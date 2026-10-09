import {
  classifyWritingAgent,
  type WritingAgentClassification,
  type WritingAgentOwner,
} from "@/lib/carriers/classifyWritingAgent";
import {
  planStatementImport,
  type ExistingTransaction,
  type ImportDisposition,
  type PlannedRow,
} from "@/lib/carriers/planStatementImport";
import type { ParsedStatement } from "@/lib/carriers/types";

export interface PreviewRow extends PlannedRow {
  classification: WritingAgentClassification;
}

export interface StatementPreview {
  statement: ParsedStatement;
  rows: PreviewRow[];
  counts: Record<ImportDisposition, number>;
  /** New rows the carrier paid (signed, so chargebacks reduce it). */
  newTotalCents: number;
  /** New rows that will import without an assigned agent. */
  unassignedNewCount: number;
  /** Review rows block the whole import until a human resolves them. */
  blockers: string[];
  canImport: boolean;
}

/**
 * An Independent agent's own statement: the carrier pays them everything on it,
 * so every row belongs to them regardless of the writing-agent name printed.
 */
function forcedClassification(owner: WritingAgentOwner): WritingAgentClassification {
  return { status: "assigned", reason: "Statement belongs to this independent agent", ...owner };
}

/**
 * Read-only preview of importing one parsed statement: duplicate planning plus
 * writing-agent assignment. Unassigned rows are NOT blockers (they import as
 * unassigned for the Owner to assign later), but ambiguous duplicates are,
 * because importing them could double count money.
 */
export function buildStatementPreview(
  statement: ParsedStatement,
  aliases: ReadonlyMap<string, WritingAgentOwner>,
  existing: readonly ExistingTransaction[],
  statementOwner: WritingAgentOwner | null = null
): StatementPreview {
  const [plan] = planStatementImport([statement], existing);

  const rows: PreviewRow[] = plan.rows.map((row) => ({
    ...row,
    classification: statementOwner
      ? forcedClassification(statementOwner)
      : classifyWritingAgent(row.transaction, aliases),
  }));

  const counts: Record<ImportDisposition, number> = {
    new: 0,
    "already-imported": 0,
    informational: 0,
    review: 0,
  };
  for (const row of rows) counts[row.disposition]++;

  const newRows = rows.filter((row) => row.disposition === "new");
  const blockers: string[] = [];
  if (counts.review > 0) {
    blockers.push(
      `${counts.review} transaction(s) look like duplicates of existing records and need review.`
    );
  }

  return {
    statement,
    rows,
    counts,
    newTotalCents: newRows.reduce((sum, row) => sum + row.transaction.amountCents, 0),
    unassignedNewCount: newRows.filter((row) => row.classification.status !== "assigned").length,
    blockers,
    canImport: blockers.length === 0,
  };
}

/** Shape expected by the `import_statement` database function. */
export interface ImportRowPayload {
  carrier: string;
  statement_month: string;
  carrier_member_id: string;
  effective_date: string;
  commission_type: string;
  amount_cents: number;
  transaction_key: string;
  writing_agent_name: string | null;
  writing_agent_verified: boolean;
  user_id: string | null;
  production_entity_id: string | null;
}

export function toImportRows(preview: StatementPreview): ImportRowPayload[] {
  return preview.rows
    .filter((row) => row.disposition === "new")
    .map(({ transaction: tx, classification }) => ({
      carrier: tx.carrier,
      statement_month: tx.statementMonth,
      carrier_member_id: tx.memberId,
      effective_date: tx.effectiveDateIso,
      commission_type: tx.type,
      amount_cents: tx.amountCents,
      transaction_key: tx.transactionKey,
      writing_agent_name: tx.writingAgent,
      writing_agent_verified: tx.writingAgentVerified,
      user_id: classification.status === "assigned" ? classification.userId : null,
      production_entity_id:
        classification.status === "assigned" ? classification.productionEntityId : null,
    }));
}
