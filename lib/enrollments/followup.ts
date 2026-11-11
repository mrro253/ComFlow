import type { EnrollmentCommissionMatch } from "./commissionMatches";
import type { PolicyStatus } from "./saleDisposition";
export const noCommissionExpectedLabel = "Did not take effect — no commission expected";
export interface SunfireFollowup {
  enrollmentCode: string;
  status: "did_not_take_effect";
  note: string;
  recordedAt: string;
}
export function noCommissionExpected(match: EnrollmentCommissionMatch, followup?: SunfireFollowup, policyStatus?: PolicyStatus) {
  return followup?.status === "did_not_take_effect" && followup.enrollmentCode === match.enrollmentCode && match.evidence.length === 0 && policyStatus !== "Active" && policyStatus !== "Future Active";
}
