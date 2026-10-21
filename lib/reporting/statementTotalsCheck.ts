export interface StatementTotalsInput {
  reportedCents: number | null;
  previousCents: number | null;
  recordedCount: number | null;
  amounts: readonly number[] | null;
}

/** Read-only comparison. Missing or unsafe numbers must never become a reassuring zero. */
export function statementTotalsCheck(input: StatementTotalsInput) {
  const valid = (n: unknown): n is number => typeof n === "number" && Number.isSafeInteger(n);
  const importedCount = input.amounts?.length ?? null;
  let importedCents: number | null = input.amounts ? 0 : null;
  for (const amount of input.amounts ?? []) {
    if (!valid(amount) || importedCents === null || !valid(importedCents + amount)) { importedCents = null; break; }
    importedCents += amount;
  }
  const expectedEntriesCents = valid(input.reportedCents) && valid(input.previousCents)
    ? input.reportedCents - input.previousCents : null;
  const calculatedCents = valid(importedCents) && valid(input.previousCents) ? importedCents + input.previousCents : null;
  // Positive: the statement total is higher than imported entries plus the previous amount.
  const differenceCents = valid(input.reportedCents) && valid(calculatedCents) ? input.reportedCents - calculatedCents : null;
  const unavailable = ![importedCents, expectedEntriesCents, calculatedCents, differenceCents].every(valid) ||
    !valid(input.recordedCount) || input.recordedCount < 0;
  const countMatches = input.recordedCount !== null && importedCount !== null ? input.recordedCount === importedCount : null;
  return {
    status: unavailable ? "unavailable" as const : differenceCents === 0 && countMatches ? "match" as const : "difference" as const,
    reportedCents: valid(input.reportedCents) ? input.reportedCents : null,
    previousCents: valid(input.previousCents) ? input.previousCents : null,
    importedCents: valid(importedCents) ? importedCents : null,
    expectedEntriesCents: valid(expectedEntriesCents) ? expectedEntriesCents : null,
    calculatedCents: valid(calculatedCents) ? calculatedCents : null,
    differenceCents: valid(differenceCents) ? differenceCents : null,
    recordedCount: valid(input.recordedCount) && input.recordedCount >= 0 ? input.recordedCount : null,
    importedCount, countMatches,
  };
}
export type StatementTotalsCheck = ReturnType<typeof statementTotalsCheck>;
