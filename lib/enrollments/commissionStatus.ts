import type { EnrollmentCommissionMatch } from "./commissionMatches";

export const commissionStatusLabels = ["Paid", "Not paid yet", "Charged back", "No commission expected"] as const;
/** A status describes statement evidence, never a bank deposit or policy coverage. */
export function enrollmentCommissionStatus(match: EnrollmentCommissionMatch, noExpected = false) {
  const evidence = match.sharedEvidence ? [] : match.evidence.filter(row => (row.fullId || row.partialId) && row.name && row.date && !row.conflict);
  const chargebacks = evidence.filter(row => row.chargeback && row.amountCents < 0);
  const payments = evidence.filter(row => !row.chargeback && row.amountCents > 0 && ["COMMISSION", "INITIAL", "RENEWAL"].includes(row.category));
  // Keep reversals visible even when another month contains a positive commission.
  const label = chargebacks.length ? "Charged back" : payments.length ? "Paid" : noExpected && match.evidence.length === 0 ? "No commission expected" : "Not paid yet";
  const reason = label === "Charged back" ? "The carrier reported a commission reversal. Other commission entries may also exist."
    : label === "Paid" ? "A matching commission appears on an imported statement. This does not confirm a bank deposit."
    : label === "No commission expected" ? "This enrollment did not take effect."
    : match.sharedEvidence || match.status === "date" || match.status === "identity" ? "A possible statement entry could not be confidently matched to this enrollment."
    : match.status === "no_statements" ? "No statements for this carrier are on file yet."
    : "No matching commission appears in the statements currently on file. It may arrive on a later statement.";
  return { label, reason, evidence, paidCents: payments.reduce((sum, row) => sum + row.amountCents, 0), chargedBackCents: chargebacks.reduce((sum, row) => sum + row.amountCents, 0) };
}
