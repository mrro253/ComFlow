import { listVisiblePaymentSources, getPaymentStatementSource } from "@/lib/repositories/paymentDetailsRepository";
import { downloadStatementPdf } from "@/lib/repositories/statementRepository";
import { extractPdfText } from "@/lib/pdf/extractPdfText";
import { extractUltimateDetails } from "@/lib/pdf/extractUltimateDetails";
import { parseUltimateText, ULTIMATE_CARRIER } from "@/lib/carriers/ultimate/parseUltimateStatement";
import { verifiedUltimateDetails, type StatementRowDetails } from "@/lib/carriers/ultimate/statementDetails";

export interface PaymentStatementDetails extends StatementRowDetails {
  statementFilename: string;
  sourceRow: number;
}

/** Only enrich transaction IDs the session can read. Never return other rows from a shared PDF. */
export async function loadPaymentDetails(transactionIds: string[], agencyId: string) {
  const result = new Map<string, PaymentStatementDetails>();
  if (!transactionIds.length) return result;
  const visible = await listVisiblePaymentSources(transactionIds, agencyId);
  for (const statementId of new Set(visible.map((tx) => tx.statement_id))) {
    try {
      const statement = await getPaymentStatementSource(statementId, agencyId);
      if (!statement?.storage_path || statement.carrier !== ULTIMATE_CARRIER) continue;
      const bytes = await downloadStatementPdf(statement.storage_path);
      const pdf = await extractPdfText(bytes);
      if (pdf.sha256 !== statement.file_hash) continue;
      const parsed = parseUltimateText(pdf.text, pdf.sha256);
      const details = verifiedUltimateDetails(parsed.transactions, await extractUltimateDetails(bytes));
      const source = new Map(parsed.transactions.map((tx) => [tx.transactionKey, tx]));
      for (const tx of visible.filter((row) => row.statement_id === statementId)) {
        const detail = details.get(tx.transaction_key);
        const row = source.get(tx.transaction_key);
        if (!detail || !row || row.memberId !== tx.carrier_member_id ||
            row.effectiveDateIso !== tx.effective_date || row.amountCents !== tx.amount_cents ||
            row.type !== tx.commission_type) continue;
        result.set(tx.id, { ...detail, statementFilename: statement.original_filename ?? "Portal statement", sourceRow: row.sourceRow });
      }
    } catch {
      // Never log PDF content or parsing errors that could contain member data.
      // The ledger remains usable when a source is missing or its layout is unsupported.
    }
  }
  return result;
}