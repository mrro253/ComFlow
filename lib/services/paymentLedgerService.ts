import { listVisibleTransactions } from "@/lib/repositories/statementRepository";
import { listUsersForAgency } from "@/lib/repositories/userRepository";
import { loadPaymentDetails, type PaymentStatementDetails } from "@/lib/services/paymentDetailsService";
import { filterPaymentMetadata, normalizePaymentFilters, paginatePayments, searchPayments } from "@/lib/reporting/paymentQuery";
import type { CurrentUser } from "@/types/domain";

/** Each request starts from fresh session/RLS-scoped rows; filters can never widen access. */
export async function loadPaymentLedger(user: CurrentUser, input: unknown) {
  const filters = normalizePaymentFilters(input);
  if (user.role !== "owner") filters.unassigned = false;
  const [all, team] = await Promise.all([listVisibleTransactions(), listUsersForAgency(user.agencyId)]);
  const candidates = filterPaymentMetadata(all, filters);
  const needsNames = Boolean(filters.search) && !/^UL\d+$/i.test(filters.search);
  let details: Map<string, PaymentStatementDetails> = needsNames ? await loadPaymentDetails(candidates.map((row) => row.id), user.agencyId) : new Map();
  const names = new Map<string, string>();
  if (needsNames) for (const [id, detail] of details) names.set(id, detail.clientName);
  const matching = searchPayments(candidates, filters.search, names);
  const page = paginatePayments(matching, filters);
  if (!needsNames) details = await loadPaymentDetails(page.rows.map((row) => row.id), user.agencyId);
  const visibleAgentIds = new Set(all.flatMap((row) => [row.userId, row.writingUserId]).filter(Boolean));
  return {
    ...page, filters: { ...filters, page: page.page },
    rows: page.rows.map((row) => ({ ...row, sourceDetails: details.get(row.id) ?? null })),
    options: {
      months: [...new Set(all.map((row) => row.statementMonth))].sort().reverse(),
      carriers: [...new Set(all.map((row) => row.carrier))].sort(),
      categories: [...new Set(all.map((row) => row.commissionType))].sort(),
      agents: team.filter((person) => visibleAgentIds.has(person.id)).map((person) => ({ id: person.id, name: `${person.firstName} ${person.lastName}` })),
    },
    team: user.role === "owner" ? team.filter((person) => person.active).map((person) => ({ id: person.id, name: `${person.firstName} ${person.lastName}` })) : [],
    warning: needsNames && candidates.some((row) => !details.has(row.id))
      ? "Some client names could not be read from saved statements. Name search may miss those payments; try a member ID instead." : null,
  };
}
export type PaymentLedgerView = Awaited<ReturnType<typeof loadPaymentLedger>>;