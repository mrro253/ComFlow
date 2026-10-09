/**
 * Carrier-layer types. Everything here is plain data: no database, UI, or
 * network imports, so the parsers and calculators that use it are trivially
 * testable and carrier providers can be swapped without touching business logic.
 */

/** One monetary row on a carrier commission statement. Amounts are signed integer cents. */
export interface ParsedTransaction {
  carrier: string;
  /** "YYYY-MM" of the statement this row appeared on. */
  statementMonth: string;
  memberId: string;
  /** Effective date exactly as printed (MM/DD/YYYY). Part of the dedupe key. */
  effectiveDate: string;
  /** ISO "YYYY-MM-DD" form of `effectiveDate`, for the database date column. */
  effectiveDateIso: string;
  /** Carrier payment category as printed: COMMISSION, RENEWAL, CHARGEBACK, ... */
  type: string;
  amountCents: number;
  /** Writing agent as printed, or null when the statement layout did not prove one. */
  writingAgent: string | null;
  writingAgentVerified: boolean;
  /** SHA-256 of the source PDF. */
  sourceHash: string;
  sourceRow: number;
  /** Nth identical row within the same statement (identical rows are legitimate). */
  occurrence: number;
  /** Stable identity: derived from the source file, row content and occurrence. */
  transactionKey: string;
}

export interface ParsedStatement {
  carrier: string;
  statementMonth: string;
  sourceHash: string;
  transactions: ParsedTransaction[];
  /** Subtotals the carrier printed, by payment category. */
  categoryTotalsCents: Record<string, number>;
  transactionTotalCents: number;
  /** Prior-period balance carried onto this statement (not a transaction). */
  carriedBalanceCents: number;
  /** Grand total the carrier printed. Always equals transactions + carried balance. */
  statementTotalCents: number;
}

/**
 * Turns the text of one carrier's statement PDF into verified transactions.
 * Parsers must throw if totals do not reconcile rather than return partial data.
 *
 * Adding a carrier means writing one of these and registering it in
 * `lib/carriers/index.ts`; nothing else in the app changes.
 * TODO: add an `ICarrierPortal` (login + statement discovery/download) interface
 * for the worker once automated pulls are built.
 */
export interface StatementParser {
  readonly carrier: string;
  parse(text: string, sourceHash: string): ParsedStatement;
}
