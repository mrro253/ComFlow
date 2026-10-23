import { digest } from "@/lib/carriers/digest";
import type { StatementRecord, CarrierTransactionRecord } from "@/lib/repositories/statementRepository";
import type { CarrierConnectionRecord } from "@/lib/repositories/carrierConnectionRepository";

export function statementWorklists(rows: StatementRecord[], verifiedCopies: ReadonlyMap<string, string> = new Map()) {
  const imported = rows.filter(row => row.status === "imported" && !row.supersededAt);
  const duplicates = new Map<string, string>();
  const needsAttention = rows.filter(row => {
    if (["imported", "superseded"].includes(row.status) || row.supersededAt) return false;
    // A PDF alone cannot establish an identical Devoted PDF/workbook pair.
    const same = ["Ultimate Health Plans", "UnitedHealthcare"].includes(row.carrier) && /^[a-f0-9]{64}$/i.test(row.fileHash)
      ? imported.find(saved => saved.carrier === row.carrier && saved.userId === row.userId && (saved.fileHash === row.fileHash || verifiedCopies.get(row.id) === saved.id) &&
        (!row.statementMonth || saved.statementMonth === row.statementMonth) && (!row.payDate || saved.payDate === row.payDate)) : undefined;
    if (same) { duplicates.set(row.id, same.id); return false; }
    return true;
  });
  return { imported, needsAttention, duplicates };
}
export function chargebackKey(row: Pick<CarrierTransactionRecord, "id" | "statementId" | "amountCents" | "effectiveDate" | "commissionType">) {
  return digest({ entryId: row.id, statementId: row.statementId, amountCents: row.amountCents, effectiveDate: row.effectiveDate, category: row.commissionType });
}
export function chargebacksNeedingReview(rows: CarrierTransactionRecord[], reviewed: ReadonlySet<string>) {
  return rows.filter(row => row.commissionType === "CHARGEBACK" && !reviewed.has(chargebackKey(row)));
}
export function connectionsNeedingAttention(rows: CarrierConnectionRecord[], userId: string) {
  return rows.filter(row => row.userId === userId && row.status === "needs_attention" && !row.syncRequestedAt && !row.lastError?.startsWith("Sync running."));
}
