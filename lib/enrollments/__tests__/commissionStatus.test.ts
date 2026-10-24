import { describe, expect, it } from "vitest";
import { enrollmentCommissionStatus } from "../commissionStatus";
import { compareEnrollmentCommissions, type CommissionEvidence } from "../commissionMatches";
import { syntheticSunfireCollection } from "../__fixtures__/sunfireCollection";
const enrollment = { ...syntheticSunfireCollection().records[0], carrier: "Ultimate Health Plans" };
const entry = (change: Partial<CommissionEvidence> = {}): CommissionEvidence => ({ entryId: "entry", statementId: "statement", carrier: enrollment.carrier, clientName: "Example Person", firstName: "Example", lastName: "Person", medicareId: enrollment.mbi.slice(-5), effectiveDate: enrollment.proposedEffectiveDate, statementMonth: "2026-02", category: "COMMISSION", amountCents: 10000, statementFilename: "synthetic.pdf", ...change });
const status = (rows: CommissionEvidence[], expected = false) => enrollmentCommissionStatus(compareEnrollmentCommissions([enrollment], rows, [enrollment.carrier])[0], expected);
describe("automatic enrollment commission status", () => {
  it("changes unpaid to paid when matching statement evidence arrives, without a review action", () => {
    expect(status([]).label).toBe("Not paid yet");
    for (const category of ["COMMISSION", "INITIAL", "RENEWAL"]) expect(status([entry({ category })]).label).toBe("Paid");
  });
  it("keeps chargebacks visible alongside other payments and recomputes after source corrections", () => {
    const reversal = entry({ entryId: "reversal", category: "CHARGEBACK", amountCents: -10000 });
    expect(status([entry(), reversal])).toMatchObject({ label: "Charged back", paidCents: 10000, chargedBackCents: -10000 });
    expect(status([reversal]).label).toBe("Charged back");
    expect(status([entry()]).label).toBe("Paid");
    expect(status([]).label).toBe("Not paid yet");
  });
  it("does not call zero, balance, adjustments or unidentified negative entries paid", () => {
    for (const row of [entry({ amountCents: 0 }), entry({ amountCents: -10000 }), entry({ category: "BALANCE" }), entry({ category: "ADJUSTMENT" })]) expect(status([row]).label).toBe("Not paid yet");
  });
  it("requires identical full or partial MBI, name, carrier and effective date", () => {
    for (const row of [entry({ effectiveDate: "2026-03-01" }), entry({ medicareId: "9EG4TE5MK73" }), entry({ firstName: "Other" }), entry({ carrier: "UnitedHealthcare" })]) expect(status([row]).label).toBe("Not paid yet");
    expect(status([entry({ medicareId: enrollment.mbi })]).label).toBe("Paid");
  });
  it("does not claim one commission for two enrollments", () => {
    const matches = compareEnrollmentCommissions([enrollment, { ...enrollment, code: "SECOND" }], [entry()], [enrollment.carrier]);
    expect(matches.map(match => enrollmentCommissionStatus(match).label)).toEqual(["Not paid yet", "Not paid yet"]);
  });
  it("preserves an explicit no-commission outcome only while no contradictory evidence exists", () => {
    expect(status([], true).label).toBe("No commission expected");
    expect(status([entry()], true).label).toBe("Paid");
    expect(status([entry({ effectiveDate: "2026-03-01" })], true).label).toBe("Not paid yet");
  });
});
