import { describe, expect, it } from "vitest";
import { compareEnrollmentCommissions, filterEnrollmentMatches, type CommissionEvidence } from "../commissionMatches";
import { syntheticSunfireCollection } from "../__fixtures__/sunfireCollection";
const enrollment = { ...syntheticSunfireCollection().records[0], carrier: "ULTIMATE HEALTH PLAN, INC." };
const entry = (change: Partial<CommissionEvidence> = {}): CommissionEvidence => ({ entryId: "entry", statementId: "statement", carrier: "Ultimate Health Plans", clientName: "Example Person", firstName: "Example", lastName: "Person", medicareId: enrollment.mbi.slice(-5), effectiveDate: enrollment.proposedEffectiveDate, statementMonth: "2026-02", category: "COMMISSION", amountCents: 10000, statementFilename: "synthetic.pdf", ...change });
const compare = (rows: CommissionEvidence[], enrollments = [enrollment]) => compareEnrollmentCommissions(enrollments, rows, ["Ultimate Health Plans"]);
describe("read-only enrollment commission candidates", () => {
  it("distinguishes full identifiers from shortened-ID candidates and masks source identifiers", () => {
    const strong = compare([entry()])[0]; expect(strong.status).toBe("strong"); expect(strong.evidence[0].partialId).toBe(true);
    const full = compare([entry({ medicareId: enrollment.mbi })])[0]; expect(full.status).toBe("full");
    expect(JSON.stringify(full)).not.toContain(enrollment.mbi); expect(JSON.stringify(strong)).not.toContain(entry().medicareId);
  });
  it("requires name, carrier and effective date alongside a five-character suffix", () => {
    expect(compare([entry({ lastName: "Other" })])[0].status).toBe("unmatched");
    expect(compare([entry({ carrier: "UnitedHealthcare" })])[0].status).toBe("unmatched");
    expect(compare([entry({ effectiveDate: "2026-01-01" })])[0].status).toBe("date");
  });
  it("keeps conflicting full IDs and names for review without promoting them to matches", () => {
    expect(compare([entry({ medicareId: "9EG4TE5MK73" })])[0].status).toBe("identity");
    expect(compare([entry({ medicareId: enrollment.mbi, firstName: "Different" })])[0].status).toBe("identity");
  });
  it("shows commissions and chargebacks separately without netting or marking paid", () => {
    const result = compare([entry(), entry({ entryId: "reversal", category: "CHARGEBACK", amountCents: -10000 })])[0];
    expect(result.status).toBe("strong"); expect(result.chargebackEntries).toBe(1); expect(result.evidence.map(row => row.amountCents)).toEqual([10000, -10000]);
    expect(result).not.toHaveProperty("paid"); expect(result).not.toHaveProperty("linked");
  });
  it("does not relabel an unrelated negative entry as a carrier-reported chargeback", () => {
    const result = compare([entry({ category: "COMMISSION", amountCents: -1000 })])[0];
    expect(result.chargebackEntries).toBe(0); expect(result.evidence[0].category).toBe("COMMISSION");
    expect(result.evidence[0].amountCents).toBe(-1000);
  });
  it("does not invent missing commissions for carriers without imported statements", () => {
    expect(compareEnrollmentCommissions([{ ...enrollment, carrier: "Example Other Carrier" }], [], ["Ultimate Health Plans"])[0].status).toBe("no_statements");
    expect(compare([])[0].status).toBe("unmatched");
  });
  it("flags repeated submissions sharing evidence and rejects duplicated inventory rows", () => {
    const results = compare([entry()], [enrollment, { ...enrollment, code: "OTHER-SUBMISSION" }]);
    expect(results.every(row => row.sharedEvidence)).toBe(true);
    expect(() => compare([entry(), entry()])).toThrow("Ambiguous");
  });
  it("filters chargebacks and client searches without altering the evidence", () => {
    const result = compare([entry({ category: "CHARGEBACK", amountCents: -10000 })]);
    expect(filterEnrollmentMatches(result, "chargebacks", "example")).toHaveLength(1);
    expect(filterEnrollmentMatches(result, "date", "")).toHaveLength(0);
    expect(filterEnrollmentMatches(result, "all", "No such client")).toHaveLength(0);
    expect(result[0].evidence).toHaveLength(1);
  });
});
