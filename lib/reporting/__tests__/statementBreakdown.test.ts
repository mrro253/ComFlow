import { describe, expect, it } from "vitest";
import { statementBreakdown } from "../statementBreakdown";

describe("statement amount presentation", () => {
  it.each([
    [14400, -11600, 26000, "Amount deducted from a previous statement"],
    [37500, 12500, 25000, "Amount added from a previous statement"],
    [2891, 0, 2891, "Previous statement balance"],
    [-1000, 0, -1000, "Previous statement balance"],
  ])("reconciles the displayed breakdown for %i and %i", (total, previous, entries, label) => {
    const result = statementBreakdown(total as number, previous as number);
    expect(result.commissionEntriesCents).toBe(entries);
    expect(result.previousBalanceLabel).toBe(label);
    expect(result.commissionEntriesCents + result.previousBalanceCents).toBe(result.statementTotalCents);
  });
  it("rejects fractional cents and subtraction beyond supported precision", () => {
    expect(() => statementBreakdown(1.5, 0)).toThrow();
    expect(() => statementBreakdown(Number.MAX_SAFE_INTEGER, -1)).toThrow();
  });
});
