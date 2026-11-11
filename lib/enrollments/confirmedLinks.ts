import { digest } from "@/lib/carriers/digest";
import type { EnrollmentCommissionMatch } from "./commissionMatches";

export interface ConfirmedEnrollmentLink { enrollmentCode: string; evidenceHash: string; entryIds: string[] }
export function linkPlan(matches: EnrollmentCommissionMatch[]): ConfirmedEnrollmentLink[] {
  return matches.filter(row => ["strong", "full"].includes(row.status) && !row.sharedEvidence &&
    !row.evidence.some(entry => entry.conflict || !entry.name)).map(row => {
    const entries = row.evidence.filter(entry => entry.name && entry.date &&
      (entry.fullId || (row.carrier === "Ultimate Health Plans" && entry.partialId)))
      .sort((a, b) => a.entryId.localeCompare(b.entryId));
    return { enrollmentCode: row.enrollmentCode, evidenceHash: digest({ enrollmentCode: row.enrollmentCode,
      carrier: row.carrier, effectiveDate: row.proposedEffectiveDate, entries }), entryIds: entries.map(entry => entry.entryId) };
  }).filter(row => row.entryIds.length > 0).sort((a, b) => a.enrollmentCode.localeCompare(b.enrollmentCode));
}
export function isConfirmedLink(plan: ConfirmedEnrollmentLink, saved: ConfirmedEnrollmentLink[]) {
  return saved.some(row => row.enrollmentCode === plan.enrollmentCode && row.evidenceHash === plan.evidenceHash && digest(row.entryIds) === digest(plan.entryIds));
}
