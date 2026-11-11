import type { CarrierTransactionRecord } from "@/lib/repositories/statementRepository";

function writer(row: CarrierTransactionRecord) {
  if (row.writingUserId) return `user:${row.writingUserId}`;
  const name = row.writingAgentName?.trim().replace(/\s+/g, " ").toUpperCase();
  return name ? `name:${name}` : "unknown";
}

/** Carrier member identity, never name matching. Input must already be session-visible active rows. */
export function clientCommissionHistory(rows: readonly CarrierTransactionRecord[], seedId: string, requestedPage = 1) {
  const seed = rows.find((row) => row.id === seedId);
  if (!seed || !seed.memberId.trim() || /\*|^(?:N\/?A|UNKNOWN|NOT PROVIDED|-+)$/i.test(seed.memberId.trim())) return null;
  const matching = rows.filter((row) => row.carrier === seed.carrier && row.memberId === seed.memberId &&
    row.userId === seed.userId && writer(row) === writer(seed))
    .sort((a, b) => b.statementMonth.localeCompare(a.statementMonth) || b.effectiveDate.localeCompare(a.effectiveDate) || a.id.localeCompare(b.id));
  let positiveCents = 0, negativeCents = 0;
  const months = new Map<string, { month: string; cents: number; entries: number; statements: Set<string> }>();
  for (const row of matching) {
    if (row.amountCents >= 0) positiveCents += row.amountCents;
    else negativeCents += row.amountCents;
    const month = months.get(row.statementMonth) ?? { month: row.statementMonth, cents: 0, entries: 0, statements: new Set<string>() };
    month.cents += row.amountCents; month.entries++; month.statements.add(row.statementId);
    months.set(row.statementMonth, month);
  }
  const pageSize = 25, pages = Math.max(1, Math.ceil(matching.length / pageSize));
  const page = Math.min(pages, Math.max(1, Number.isSafeInteger(requestedPage) ? requestedPage : 1));
  return {
    carrier: seed.carrier, memberId: seed.memberId, count: matching.length,
    statementCount: new Set(matching.map((row) => row.statementId)).size,
    totalCents: positiveCents + negativeCents, positiveCents, negativeCents,
    months: [...months.values()].map(({ statements, ...month }) => ({ ...month, statementCount: statements.size })),
    page, pages, start: (page - 1) * pageSize + 1, end: Math.min(page * pageSize, matching.length),
    rows: matching.slice((page - 1) * pageSize, page * pageSize),
  };
}
