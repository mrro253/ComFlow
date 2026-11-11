import { describe, expect, it } from "vitest";
import { statementTotalsCheck } from "./statementTotalsCheck";
const base = { reportedCents: 10001, previousCents: 0, recordedCount: 2, amounts: [8000, 2001] };
describe("statement totals comparison", () => {
  it("matches signed integer cents and entry counts", () => {
    expect(statementTotalsCheck(base)).toMatchObject({ status: "match", importedCents: 10001, calculatedCents: 10001, differenceCents: 0, countMatches: true });
  });
  it("accounts for both additions and deductions from previous statements", () => {
    expect(statementTotalsCheck({ ...base, reportedCents: 11001, previousCents: 1000 }).status).toBe("match");
    expect(statementTotalsCheck({ ...base, reportedCents: 9001, previousCents: -1000 }).status).toBe("match");
  });
  it("retains negative and legitimate duplicate entries", () => {
    expect(statementTotalsCheck({ reportedCents: 1500, previousCents: 0, recordedCount: 3, amounts: [1000, 1000, -500] })).toMatchObject({ status: "match", importedCents: 1500 });
  });
  it("shows signed discrepancies without inferring missing payments", () => {
    expect(statementTotalsCheck({ ...base, reportedCents: 10101 })).toMatchObject({ status: "difference", differenceCents: 100 });
    expect(statementTotalsCheck({ ...base, reportedCents: 9901 })).toMatchObject({ status: "difference", differenceCents: -100 });
  });
  it("flags a count difference even when the amounts match", () => {
    expect(statementTotalsCheck({ ...base, recordedCount: 3 })).toMatchObject({ status: "difference", differenceCents: 0, countMatches: false });
  });
  it("does not replace unknown or incomplete values with zeros", () => {
    for (const change of [{ reportedCents: null }, { previousCents: null }, { recordedCount: null }, { amounts: null }]) expect(statementTotalsCheck({ ...base, ...change }).status).toBe("unavailable");
    expect(statementTotalsCheck({ ...base, amounts: null }).importedCents).toBeNull();
  });
  it("accepts a true zero-entry statement with a previous amount", () => {
    expect(statementTotalsCheck({ reportedCents: -1250, previousCents: -1250, recordedCount: 0, amounts: [] }).status).toBe("match");
  });
  it("rejects fractions, unsafe values, and overflowing sums even if later canceled", () => {
    for (const amount of [0.5, Infinity, NaN, Number.MAX_SAFE_INTEGER + 1]) expect(statementTotalsCheck({ ...base, amounts: [amount] }).status).toBe("unavailable");
    expect(statementTotalsCheck({ ...base, amounts: [Number.MAX_SAFE_INTEGER, 1, -Number.MAX_SAFE_INTEGER] }).status).toBe("unavailable");
    expect(statementTotalsCheck({ ...base, recordedCount: -1 }).status).toBe("unavailable");
  });
});
