import { formatCents } from "@/lib/carriers/money";
import { totalsByCategory } from "@/lib/reporting/carrierMetrics";

/** One imported payment, already scoped to what the viewer is allowed to see. */
export interface ReportPayment {
  statementMonth: string;
  carrier: string;
  memberId: string;
  commissionType: string;
  amountCents: number;
  writingAgentName: string | null;
  creditedTo: string | null;
}

export interface CollectiveReport {
  fromMonth: string | null;
  toMonth: string | null;
  paymentCount: number;
  totalCents: number;
  byCategory: { type: string; cents: number; count: number }[];
  rows: ReportPayment[];
}

export function monthsInRange<T extends { statementMonth: string }>(
  payments: readonly T[],
  fromMonth: string | null,
  toMonth: string | null
): T[] {
  return payments.filter((row) => {
    if (fromMonth && row.statementMonth < fromMonth) return false;
    if (toMonth && row.statementMonth > toMonth) return false;
    return true;
  });
}

export function buildCollectiveReport(
  payments: readonly ReportPayment[],
  fromMonth: string | null = null,
  toMonth: string | null = null
): CollectiveReport {
  const rows = monthsInRange(payments, fromMonth, toMonth).sort(
    (a, b) =>
      b.statementMonth.localeCompare(a.statementMonth) ||
      a.carrier.localeCompare(b.carrier) ||
      a.memberId.localeCompare(b.memberId)
  );
  return {
    fromMonth,
    toMonth,
    paymentCount: rows.length,
    totalCents: rows.reduce((sum, row) => sum + row.amountCents, 0),
    byCategory: totalsByCategory(
      rows.map((row) => ({
        userId: null,
        statementMonth: row.statementMonth,
        commissionType: row.commissionType,
        amountCents: row.amountCents,
      }))
    ),
    rows,
  };
}

function csvCell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** CSV the Independent (or Owner) can download and send upstream externally. */
export function collectiveReportCsv(report: CollectiveReport): string {
  const header = ["Month", "Carrier", "Member ID", "Category", "Amount", "Writing agent", "Credited to"];
  const lines = [
    header.join(","),
    ...report.rows.map((row) =>
      [
        row.statementMonth,
        row.carrier,
        row.memberId,
        row.commissionType,
        formatCents(row.amountCents),
        row.writingAgentName ?? "",
        row.creditedTo ?? "",
      ]
        .map(csvCell)
        .join(",")
    ),
  ];
  return `${lines.join("\n")}\n`;
}
