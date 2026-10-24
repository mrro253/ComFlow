import type { CurrentUser } from "@/types/domain";
import { listEditableSales } from "./saleDispositionService";
import { compareVerifiedEnrollments } from "./sunfireMatchService";
import { readSunfireFollowups, readAssignedSaleFollowup } from "@/lib/repositories/sunfireFollowupRepository";
import { noCommissionExpected } from "@/lib/enrollments/followup";
import { enrollmentCommissionStatus } from "@/lib/enrollments/commissionStatus";

/** Derived on every request; no financial records, associations or review receipts are written. */
export async function listEnrollmentStatuses(user: CurrentUser, selected?: string) {
  const sales = await listEditableSales(user, selected, true);
  if (!sales.length) return [];
  const verified = await compareVerifiedEnrollments(user, sales.map(sale => { if (!sale.source) throw new Error("Enrollment source unavailable."); return sale.source; }));
  const followups = user.role === "owner" ? await readSunfireFollowups(user, sales[0].collectionHash) : {};
  const assignedFollowups = user.role === "agent" ? await Promise.all(sales.map(sale => readAssignedSaleFollowup(user, sale.ownerId, sale.collectionHash, sale.code))) : [];
  return sales.map((sale, index) => {
    const match = verified.matches[index];
    if (!match || match.enrollmentCode !== sale.code) throw new Error("Enrollment comparison unavailable.");
    const followup = user.role === "owner" ? followups[sale.code] : assignedFollowups[index];
    const status = enrollmentCommissionStatus(match, noCommissionExpected(match, followup, sale.disposition?.status));
    const { source: _source, ...display } = sale;
    void _source;
    return { ...display, commission: status, explanation: status.label === "No commission expected" ? followup?.note : undefined };
  });
}
