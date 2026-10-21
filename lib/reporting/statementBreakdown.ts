/** Presentation of the existing statement-total equation; never changes ledger amounts. */
export function statementBreakdown(statementTotalCents: number, previousBalanceCents: number) {
  const commissionEntriesCents = statementTotalCents - previousBalanceCents;
  if (![statementTotalCents, previousBalanceCents, commissionEntriesCents].every(Number.isSafeInteger)) {
    throw new Error("Statement amounts must be safe integer cents");
  }
  return {
    commissionEntriesCents,
    previousBalanceCents,
    statementTotalCents,
    previousBalanceLabel: previousBalanceCents < 0
      ? "Amount deducted from a previous statement"
      : previousBalanceCents > 0
        ? "Amount added from a previous statement"
        : "Previous statement balance",
  };
}
