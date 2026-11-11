import { describe, expect, it } from "vitest";
import { compareEnrollmentCommissions, type CommissionEvidence } from "../commissionMatches";
import { linkPlan, isConfirmedLink } from "../confirmedLinks";
import { syntheticSunfireCollection } from "../__fixtures__/sunfireCollection";
const enrollment = { ...syntheticSunfireCollection().records[0], carrier: "Ultimate Health Plans" };
const entry: CommissionEvidence = { entryId: "entry", statementId: "statement", carrier: enrollment.carrier, clientName: "Example Person", firstName: "Example", lastName: "Person", medicareId: enrollment.mbi.slice(-5), effectiveDate: enrollment.proposedEffectiveDate, statementMonth: "2026-02", category: "COMMISSION", amountCents: 10000, statementFilename: "synthetic.pdf" };
const compare = (entries = [entry], enrollments = [enrollment]) => compareEnrollmentCommissions(enrollments, entries, [enrollment.carrier]);
describe("owner-confirmed enrollment links", () => {
  it("links agreeing Ultimate entries including chargebacks without netting amounts", () => {
    const plan = linkPlan(compare([entry, { ...entry, entryId: "chargeback", category: "CHARGEBACK", amountCents: -10000 }]));
    expect(plan).toHaveLength(1); expect(plan[0].entryIds).toEqual(["chargeback", "entry"]);
    expect(JSON.stringify(plan)).not.toContain(enrollment.mbi); expect(JSON.stringify(plan)).not.toContain("Example Person");
  });
  it("excludes date mismatches, name conflicts and shared evidence", () => {
    expect(linkPlan(compare([{ ...entry, effectiveDate: "2025-01-01" }]))).toEqual([]);
    expect(linkPlan(compare([{ ...entry, lastName: "Other" }]))).toEqual([]);
    expect(linkPlan(compare([entry], [enrollment, { ...enrollment, code: "OTHER" }]))).toEqual([]);
  });
  it("limits shortened-ID approval to Ultimate and supports full-ID evidence", () => {
    const other = { ...enrollment, carrier: "UnitedHealthcare" };
    const rows = (medicareId: string) => compareEnrollmentCommissions([other], [{ ...entry, carrier: other.carrier, medicareId }], [other.carrier]);
    expect(linkPlan(rows(enrollment.mbi.slice(-5)))).toEqual([]);
    expect(linkPlan(rows(enrollment.mbi))).toHaveLength(1);
  });
  it("invalidates confirmations after amount or source evidence changes", () => {
    const saved = linkPlan(compare()); expect(isConfirmedLink(saved[0], saved)).toBe(true);
    const changed = linkPlan(compare([{ ...entry, amountCents: 20000 }])); expect(isConfirmedLink(changed[0], saved)).toBe(false);
    expect(isConfirmedLink({ ...saved[0], entryIds: ["other"] }, saved)).toBe(false);
  });
});
