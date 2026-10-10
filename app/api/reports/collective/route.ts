import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import {
  buildCollectiveReport,
  collectiveReportCsv,
} from "@/lib/reporting/collectiveReport";
import { listVisibleTransactions } from "@/lib/repositories/statementRepository";
import { listUsersForAgency } from "@/lib/repositories/userRepository";
import { recordAuditEvent } from "@/lib/repositories/statementRepository";

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

function monthParam(value: string | null): string | null {
  return value && MONTH.test(value) ? value : null;
}

/**
 * CSV of the signed-in user's visible carrier payments (RLS-scoped).
 * Independents use this to send a collective report upstream externally.
 */
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const url = new URL(request.url);
  const from = monthParam(url.searchParams.get("from"));
  const to = monthParam(url.searchParams.get("to"));

  const [transactions, team] = await Promise.all([
    listVisibleTransactions(),
    listUsersForAgency(user.agencyId),
  ]);
  const nameById = new Map(team.map((u) => [u.id, `${u.firstName} ${u.lastName}`]));
  const report = buildCollectiveReport(
    transactions.map((tx) => ({
      statementMonth: tx.statementMonth,
      carrier: tx.carrier,
      memberId: tx.memberId,
      commissionType: tx.commissionType,
      amountCents: tx.amountCents,
      writingAgentName: tx.writingAgentName,
      creditedTo: tx.userId ? (nameById.get(tx.userId) ?? "Teammate") : null,
    })),
    from,
    to
  );

  await recordAuditEvent({
    agencyId: user.agencyId,
    actorId: user.id,
    action: "report.collective_downloaded",
    entityType: "agency",
    entityId: user.agencyId,
    details: { from, to, rows: report.paymentCount },
  });

  const filename = `commissionflow-report${from ? `-${from}` : ""}${to ? `-to-${to}` : ""}.csv`;
  return new Response(collectiveReportCsv(report), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
