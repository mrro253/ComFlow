import { listVisibleTransactions } from "@/lib/repositories/statementRepository";
import { listVisibleConnections } from "@/lib/repositories/carrierConnectionRepository";
import { reviewedAttentionKeys, appendChargebackReview } from "@/lib/repositories/attentionRepository";
import { chargebacksNeedingReview, chargebackKey, connectionsNeedingAttention } from "@/lib/reporting/attention";
import { getStatementWorklists } from "@/lib/services/statementWorklistService";
import { loadPaymentDetails } from "@/lib/services/paymentDetailsService";
import { canManageStatements } from "@/lib/auth/statementAccess";
import { canManageCarrierLogin } from "@/lib/auth/carrierAccess";
import type { CurrentUser } from "@/types/domain";
import { getSunfireMatches } from "@/lib/services/sunfireMatchService";
import { readSunfireFollowups } from "@/lib/repositories/sunfireFollowupRepository";
import { readSaleEvents } from "@/lib/repositories/saleDispositionRepository";
import { latestSaleDisposition } from "@/lib/enrollments/saleDisposition";
import { noCommissionExpected } from "@/lib/enrollments/followup";
async function enrollmentExceptions(user: CurrentUser) {
  if (user.role !== "owner") return [];
  const review = await getSunfireMatches(user);
  if (!review.current) return [];
  const [followups, events] = await Promise.all([readSunfireFollowups(user, review.current.hash), readSaleEvents(user)]);
  return review.matches.flatMap(row => {
    const status = latestSaleDisposition(events, user.id, review.current!.hash, row.enrollmentCode)?.status;
    const conflict = Boolean(followups[row.enrollmentCode]) && !noCommissionExpected(row, followups[row.enrollmentCode], status);
    const reason = conflict ? "A previous explanation conflicts with newer information" : row.sharedEvidence ? "The same commission evidence appears under more than one enrollment" : row.status === "date" ? "Enrollment and statement effective dates differ" : row.status === "identity" ? "Identity details disagree" : null;
    return reason ? [{ code: row.enrollmentCode, clientName: row.clientName, carrier: row.carrier, reason, hash: review.current!.hash }] : [];
  });
}
export async function getAttention(user: CurrentUser) {
  if (!user.active) throw new Error("Active account required.");
  const [transactions, statements, connections, reviewed, sales] = await Promise.all([
    listVisibleTransactions(), canManageStatements(user) ? getStatementWorklists(user) : null,
    canManageCarrierLogin(user) ? listVisibleConnections(true) : [], reviewedAttentionKeys(user), enrollmentExceptions(user),
  ]);
  const chargebacks = chargebacksNeedingReview(transactions, reviewed);
  const details = await loadPaymentDetails(chargebacks.map(row => row.id), user.agencyId);
  if (chargebacks.some(row => !details.has(row.id))) throw new Error("Could not verify chargeback details.");
  return { transactions, statements: statements?.needsAttention ?? [], downloadedPairs: statements?.downloadedPairs ?? [], sales,
    unassignedCount: user.role === "owner" ? transactions.filter(row => row.userId === null).length : 0,
    connectionSetupNeeded: canManageCarrierLogin(user) && !connections.some(row => row.userId === user.id),
    chargebacks: chargebacks.map(row => ({ ...row, clientName: details.get(row.id)!.clientName,
      carrierNote: details.get(row.id)!.fields.find(field => field.label.toUpperCase() === "NOTES")?.value ?? "" })), connections: connectionsNeedingAttention(connections, user.id) };
}
export async function acknowledgeChargeback(user: CurrentUser, key: string) {
  if (!user.active) throw new Error("Active account required.");
  const visible = await listVisibleTransactions();
  if (!visible.some(row => row.commissionType === "CHARGEBACK" && chargebackKey(row) === key)) throw new Error("Chargeback unavailable or changed. Refresh the page.");
  await appendChargebackReview(user, key);
}
