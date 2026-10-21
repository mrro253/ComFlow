import { canAccessStatement } from "@/lib/auth/statementAccess";
import { getStatement, listStatementCoverage, type StatementRecord } from "@/lib/repositories/statementRepository";
import { listStatementAmounts } from "@/lib/repositories/statementTotalsRepository";
import { statementTotalsCheck } from "@/lib/reporting/statementTotalsCheck";
import type { CurrentUser } from "@/types/domain";

export async function loadStatementTotalsCheck(user: CurrentUser, statementId: string) {
  const statement = await getStatement(statementId);
  if (!statement || !canAccessStatement(user, statement) || !["imported", "superseded"].includes(statement.status)) return null;
  return checkVisibleStatement(user, statement);
}

async function checkVisibleStatement(user: CurrentUser, statement: StatementRecord) {
  let amounts: number[] | null = null;
  try { amounts = await listStatementAmounts(statement.id, user.agencyId); } catch { /* An incomplete read is explicitly unavailable. */ }
  return { statement, check: statementTotalsCheck({ reportedCents: statement.statementTotalCents,
    previousCents: statement.carriedBalanceCents, recordedCount: statement.transactionCount, amounts }) };
}

export async function loadStatementTotalsOverview(user: CurrentUser) {
  const visible = (await listStatementCoverage()).filter((s) => s.status === "imported" && !s.supersededAt && canAccessStatement(user, s));
  const results: Awaited<ReturnType<typeof checkVisibleStatement>>[] = [];
  for (let start = 0; start < visible.length; start += 4) {
    results.push(...await Promise.all(visible.slice(start, start + 4).map((s) => checkVisibleStatement(user, s))));
  }
  return results.sort((a, b) => (b.statement.statementMonth ?? "").localeCompare(a.statement.statementMonth ?? "") || a.statement.carrier.localeCompare(b.statement.carrier));
}
