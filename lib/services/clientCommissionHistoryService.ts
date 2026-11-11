import { listVisibleTransactions } from "@/lib/repositories/statementRepository";
import { clientCommissionHistory } from "@/lib/reporting/clientCommissionHistory";
import { canAccessStatement } from "@/lib/auth/statementAccess";
import type { CurrentUser } from "@/types/domain";

/** Refresh access on every request, including pagination. No source parsing, writes, or shared cache. */
export async function loadClientCommissionHistory(user: CurrentUser, transactionId: string, page = 1) {
  const visible = await listVisibleTransactions();
  const history = clientCommissionHistory(visible, transactionId, page);
  if (!history) return null;
  return { ...history, rows: history.rows.map((row) => ({
    id: row.id, statementId: row.statementId, statementMonth: row.statementMonth,
    effectiveDate: row.effectiveDate, category: row.commissionType, cents: row.amountCents,
    canViewStatement: canAccessStatement(user, row),
  })) };
}
export type ClientCommissionHistoryView = NonNullable<Awaited<ReturnType<typeof loadClientCommissionHistory>>>;
