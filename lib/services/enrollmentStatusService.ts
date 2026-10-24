import type { CurrentUser } from "@/types/domain";
import { listEditableSales } from "./saleDispositionService";
import { compareVerifiedEnrollments } from "./sunfireMatchService";
import { readSunfireFollowups, readAssignedSaleFollowup } from "@/lib/repositories/sunfireFollowupRepository";
import { readApplicationOutcomes } from "@/lib/repositories/applicationOutcomeRepository";
import { applicationFingerprint } from "@/lib/enrollments/applicationOutcome";
import { enrollmentCommissionStatus } from "@/lib/enrollments/commissionStatus";

/** Derived on every request; no financial records, associations or review receipts are written. */
export async function listEnrollmentStatuses(user: CurrentUser, selected?: string) {
  const sales = await listEditableSales(user, selected, true);
  if (!sales.length) return [];
  const verified = await compareVerifiedEnrollments(user, sales.map(sale => { if (!sale.source) throw new Error("Enrollment source unavailable."); return sale.source; }));
  const followupCache = new Map<string, Awaited<ReturnType<typeof readSunfireFollowups>>>();
  if (user.role === "owner") for (const sale of sales) for (const version of sale.versions ?? [{ hash: sale.collectionHash, source: sale.source! }]) {
    if (!followupCache.has(version.hash)) followupCache.set(version.hash, await readSunfireFollowups(user, version.hash));
  }
  const outcomes = await Promise.all(sales.map(sale => readApplicationOutcomes(user, sale.ownerId, sale.collectionHash, sale.code)));
  const assignedFollowups = user.role === "agent" ? await Promise.all(sales.map(sale => readAssignedSaleFollowup(user, sale.ownerId, sale.collectionHash, sale.code))) : [];
  return sales.map((sale, index) => {
    const match = verified.matches[index];
    if (!match || match.enrollmentCode !== sale.code) throw new Error("Enrollment comparison unavailable.");
    const legacyVersion = sale.versions?.find(version => applicationFingerprint(version.source) === applicationFingerprint(sale.source!) && followupCache.get(version.hash)?.[sale.code]);
    const followup = user.role === "owner" ? followupCache.get(legacyVersion?.hash ?? sale.collectionHash)?.[sale.code] : assignedFollowups[index];
    const outcome = outcomes[index].latest;
    const legacyNoCommission = followup?.status === "did_not_take_effect" && followup.enrollmentCode === sale.code && sale.disposition?.status !== "Active" && sale.disposition?.status !== "Future Active";
    const status = enrollmentCommissionStatus(match, outcome ? outcome.status === "did_not_take_effect" : legacyNoCommission);
    const { source: _source, versions: _versions, ...display } = sale;
    void _source; void _versions;
    return { ...display, commission: status, outcomeHistory: outcomes[index].history.map(({ fingerprint: _fingerprint, ...event }) => { void _fingerprint; return event; }), explanation: outcome?.note ?? (status.label === "No commission expected" ? followup?.note : undefined) };
  });
}
