import { describe, expect, it } from "vitest";
import { statementReviewLabel, type ReviewEvidence } from "./statementReview";

const sample: ReviewEvidence = { carrier: "Example", userId: "agent-a", month: "2026-01", contentHash: "complete-report-a" };
describe("statement review labels", () => {
  it("recognizes identical full reports", () => expect(statementReviewLabel(sample, [sample])).toBe("Already imported"));
  it("keeps changed report details visible even when amounts might match", () => expect(statementReviewLabel({ ...sample, contentHash: "changed-client-or-balance" }, [sample])).toBe("Possible correction"));
  it("does not match another owner or carrier", () => {
    expect(statementReviewLabel(sample, [{ ...sample, userId: "agent-b" }, { ...sample, carrier: "Other" }])).toBe("New statement");
  });
  it("keeps unreadable or unsupported incoming reports visible", () => expect(statementReviewLabel({ ...sample, contentHash: null }, [sample])).toBe("Needs review"));
  it("does not hide a report when its baseline is unreadable", () => expect(statementReviewLabel(sample, [{ ...sample, contentHash: null }])).toBe("Possible correction"));
  it("does not infer a month", () => expect(statementReviewLabel({ ...sample, month: null }, [])).toBe("Needs review"));
});
