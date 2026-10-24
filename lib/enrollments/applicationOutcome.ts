import { digest } from "@/lib/carriers/digest";
import { canonicalEnrollmentCarrier } from "./commissionMatches";
import type { SunfireEnrollment } from "./sunfire";

export type ApplicationOutcomeStatus = "did_not_take_effect" | "commission_expected";
export interface ApplicationOutcome {
  id: string; status: ApplicationOutcomeStatus; note: string; actorName: string; recordedAt: string;
  fingerprint: string;
}
/** Application code, not client identity or collection snapshot, defines the record. */
export function applicationKey(agencyId: string, ownerId: string, code: string) {
  return digest({ source: "SunFire", agencyId, ownerId, code });
}
export function applicationFingerprint(row: SunfireEnrollment) {
  return digest({ code: row.code, mbi: row.mbi, carrier: canonicalEnrollmentCarrier(row.carrier), plan: row.plan,
    effectiveDate: row.proposedEffectiveDate, submittedDate: row.submittedDate });
}
export function validateApplicationOutcome(status: string, note: string): { status: ApplicationOutcomeStatus; note: string } {
  if (!["did_not_take_effect", "commission_expected"].includes(status) || !note.trim() || note.trim().length > 2000)
    throw new Error("Choose an enrollment outcome and explain why (up to 2,000 characters).");
  return { status: status as ApplicationOutcomeStatus, note: note.trim() };
}
