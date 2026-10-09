import type { ParsedStatement, ParsedTransaction } from "@/lib/carriers/types";

/** A transaction already in the ledger, reduced to what duplicate detection needs. */
export interface ExistingTransaction {
  id: string;
  transactionKey: string;
  carrier: string;
  statementMonth: string;
  memberId: string;
  type: string;
  amountCents: number;
}

export type ImportDisposition =
  | "new"
  | "already-imported"
  | "informational"
  | "review";

export interface PlannedRow {
  transaction: ParsedTransaction;
  disposition: ImportDisposition;
  reason: string;
  matchedExistingId?: string;
}

export interface StatementImportPlan {
  statement: ParsedStatement;
  /** The same PDF content appeared earlier in this batch; nothing is proposed. */
  duplicateFile: boolean;
  rows: PlannedRow[];
}

function economicKey(row: ParsedTransaction): string {
  return JSON.stringify([row.carrier, row.statementMonth, row.memberId, row.type, row.amountCents]);
}

function existingEconomicKey(row: ExistingTransaction): string {
  return JSON.stringify([row.carrier, row.statementMonth, row.memberId, row.type, row.amountCents]);
}

function sameEconomics(row: ParsedTransaction, existing: ExistingTransaction): boolean {
  return economicKey(row) === existingEconomicKey(existing);
}

/**
 * Read-only preview of what importing these statements would do. Nothing is
 * written. Duplicate protection layers: identical PDF content, exact
 * source-backed transaction key, and economically identical rows without exact
 * source proof (held for review rather than silently merged or double counted).
 */
export function planStatementImport(
  statements: readonly ParsedStatement[],
  existing: readonly ExistingTransaction[]
): StatementImportPlan[] {
  const existingByKey = new Map(existing.map((row) => [row.transactionKey, row]));
  const existingEconomics = new Set(existing.map(existingEconomicKey));
  const seenSources = new Set<string>();
  const batchEconomics = new Map<string, string>();
  const plans: StatementImportPlan[] = [];

  for (const statement of statements) {
    if (seenSources.has(statement.sourceHash)) {
      plans.push({ statement, duplicateFile: true, rows: [] });
      continue;
    }
    seenSources.add(statement.sourceHash);

    const rows = statement.transactions.map((transaction): PlannedRow => {
      const hit = existingByKey.get(transaction.transactionKey);
      if (hit) {
        return sameEconomics(transaction, hit)
          ? {
              transaction,
              disposition: "already-imported",
              reason: "Matched exact source-backed transaction key",
              matchedExistingId: hit.id,
            }
          : {
              transaction,
              disposition: "review",
              reason: "Existing transaction key has different content",
            };
      }
      if (transaction.amountCents === 0) {
        return {
          transaction,
          disposition: "informational",
          reason: "Zero-dollar carrier event; no monetary import proposed",
        };
      }
      const economic = economicKey(transaction);
      const otherSource = batchEconomics.get(economic);
      if (existingEconomics.has(economic) || (otherSource && otherSource !== statement.sourceHash)) {
        return {
          transaction,
          disposition: "review",
          reason: "Similar transaction exists without exact source proof",
        };
      }
      batchEconomics.set(economic, statement.sourceHash);
      return { transaction, disposition: "new", reason: "New source-backed transaction key" };
    });

    plans.push({ statement, duplicateFile: false, rows });
  }

  // A second source with the same economic row makes both proposals ambiguous.
  const ambiguous = new Set(
    plans.flatMap((plan) =>
      plan.rows.filter((row) => row.disposition === "review").map((row) => economicKey(row.transaction))
    )
  );
  for (const plan of plans) {
    for (const row of plan.rows) {
      if (row.disposition === "new" && ambiguous.has(economicKey(row.transaction))) {
        row.disposition = "review";
        row.reason = "Similar transaction appears in another source";
      }
    }
  }

  return plans;
}
