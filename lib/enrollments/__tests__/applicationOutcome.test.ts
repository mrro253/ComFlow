import { describe, expect, it } from "vitest";
import { applicationKey, applicationFingerprint, validateApplicationOutcome } from "../applicationOutcome";
import { syntheticSunfireCollection } from "../__fixtures__/sunfireCollection";
import { compareEnrollmentCommissions, type CommissionEvidence } from "../commissionMatches";
import { enrollmentCommissionStatus } from "../commissionStatus";
const original = { ...syntheticSunfireCollection().records[0], carrier: "Ultimate Health Plans", plan: "Example H1234-001-000" };
const replacement = { ...original, code: "NEWAPPLICATION", proposedEffectiveDate: "2026-03-01" };
const evidence = (change: Partial<CommissionEvidence> = {}): CommissionEvidence => ({ entryId: "entry", statementId: "statement", carrier: original.carrier, clientName: "Example Person", firstName: "Example", lastName: "Person", medicareId: original.mbi, effectiveDate: replacement.proposedEffectiveDate, plan: original.plan, statementMonth: "2026-03", category: "COMMISSION", amountCents: 10000, statementFilename: "synthetic.pdf", ...change });
describe("application-specific outcomes", () => {
  it("uses application code and tenant, never MBI alone, as identity", () => {
    expect(applicationKey("agency", "owner", original.code)).not.toBe(applicationKey("agency", "owner", replacement.code));
    expect(applicationKey("agency", "owner", original.code)).not.toBe(applicationKey("other", "owner", original.code));
    expect(applicationKey("agency", "owner", original.code)).not.toBe(applicationKey("agency", "other", original.code));
    expect(applicationFingerprint(original)).not.toBe(applicationFingerprint(replacement));
    expect(applicationFingerprint({ ...original, status: "refreshed" })).toBe(applicationFingerprint(original));
  });
  it("keeps the original not-taken-effect application separate from the paid replacement", () => {
    const matches = compareEnrollmentCommissions([original, replacement], [evidence()], [original.carrier]);
    expect(enrollmentCommissionStatus(matches[0], true).label).toBe("No commission expected");
    expect(enrollmentCommissionStatus(matches[1]).label).toBe("Paid");
    expect(matches[1].sharedEvidence).toBe(false);
  });
  it("does not guess which application was paid when plan/date evidence is identical", () => {
    const matches = compareEnrollmentCommissions([original, { ...original, code: "OTHER" }], [evidence({ effectiveDate: original.proposedEffectiveDate })], [original.carrier]);
    expect(enrollmentCommissionStatus(matches[0], true).label).toBe("No commission expected");
    expect(enrollmentCommissionStatus(matches[1]).label).toBe("Not paid yet");
  });
  it("uses a printed plan code to distinguish same-date replacement plans", () => {
    const newer = { ...original, code: "OTHER", plan: "Other plan H1234-002-000" };
    const matches = compareEnrollmentCommissions([original, newer], [evidence({ effectiveDate: original.proposedEffectiveDate, plan: newer.plan })], [original.carrier]);
    expect(enrollmentCommissionStatus(matches[0]).label).toBe("Not paid yet");
    expect(enrollmentCommissionStatus(matches[1]).label).toBe("Paid");
  });
  it("requires an explanation and supports undo without deleting history", () => {
    expect(validateApplicationOutcome("commission_expected", " Correcting an error ")).toEqual({ status: "commission_expected", note: "Correcting an error" });
    for (const [status, note] of [["did_not_take_effect", " "], ["Paid", "Explanation"], ["did_not_take_effect", "x".repeat(2001)]]) expect(() => validateApplicationOutcome(status, note)).toThrow();
  });
});
