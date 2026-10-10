import type { ExistingTransaction } from "@/lib/carriers/planStatementImport";
import type { ParsedTransaction } from "@/lib/carriers/types";

/** Share of rows two statements must have in common to count as the same statement. */
export const CORRECTION_OVERLAP_THRESHOLD = 0.5;

export interface StatementRef {
  id: string;
  filename: string | null;
}

/** An already-imported statement with the same file name, month and owner as the new one. */
export interface PriorStatement extends StatementRef {
  transactions: readonly ExistingTransaction[];
}

export type CorrectionPlan =
  | { kind: "none" }
  /** Same file name and the same payments: bring it in only once. */
  | { kind: "duplicate"; of: StatementRef }
  /** Same file name but different payments: treat the new one as the corrected version. */
  | { kind: "supersede"; replaces: StatementRef[] };

/** Case/space-insensitive file name used to find earlier copies of a statement. */
export function normalizeFilename(name: string | null | undefined): string {
  return (name ?? "").trim().toLowerCase();
}

type EconomicRow = Pick<ParsedTransaction, "carrier" | "statementMonth" | "memberId" | "type" | "amountCents">;

function key(row: EconomicRow): string {
  return JSON.stringify([row.carrier, row.statementMonth, row.memberId, row.type, row.amountCents]);
}

function counts(keys: readonly string[]): Map<string, number> {
  const result = new Map<string, number>();
  for (const k of keys) result.set(k, (result.get(k) ?? 0) + 1);
  return result;
}

/** Number of rows (counting repeats) the two lists have in common. */
function overlap(a: Map<string, number>, b: Map<string, number>): number {
  let shared = 0;
  for (const [k, n] of a) shared += Math.min(n, b.get(k) ?? 0);
  return shared;
}

/**
 * Decides what a new statement means when earlier imported statements share its
 * file name, carrier, month and owner (the caller filters on those):
 *
 *  - identical payments  -> duplicate, only brought once
 *  - mostly the same payments but not identical -> a corrected version that
 *    supersedes the earlier one(s)
 *  - barely any payments in common -> unrelated (for example two payees whose
 *    statements both use a generic file name): nothing is replaced
 *
 * Zero-dollar rows are never imported, so they are ignored here.
 */
export function planCorrection(
  rows: readonly EconomicRow[],
  priors: readonly PriorStatement[]
): CorrectionPlan {
  const incoming = counts(rows.filter((r) => r.amountCents !== 0).map(key));
  const incomingTotal = [...incoming.values()].reduce((sum, n) => sum + n, 0);

  const replaces: StatementRef[] = [];
  for (const prior of priors) {
    const existing = counts(prior.transactions.filter((t) => t.amountCents !== 0).map((t) => key(t)));
    const existingTotal = [...existing.values()].reduce((sum, n) => sum + n, 0);
    const shared = overlap(incoming, existing);

    if (shared === incomingTotal && shared === existingTotal) {
      return { kind: "duplicate", of: { id: prior.id, filename: prior.filename } };
    }
    const larger = Math.max(incomingTotal, existingTotal);
    if (larger > 0 && shared / larger >= CORRECTION_OVERLAP_THRESHOLD) {
      replaces.push({ id: prior.id, filename: prior.filename });
    }
  }
  return replaces.length > 0 ? { kind: "supersede", replaces } : { kind: "none" };
}
