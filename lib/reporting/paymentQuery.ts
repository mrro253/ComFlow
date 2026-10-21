import { PRODUCT_TYPES } from "@/lib/reporting/productTypes";
import { sumCents, totalsByCategory } from "@/lib/reporting/carrierMetrics";
import type { CarrierTransactionRecord } from "@/lib/repositories/statementRepository";

export interface PaymentFilters {
  search: string; month: string; carrier: string; agent: string; category: string; product: string;
  from: string; to: string; unassigned: boolean; page: number; pageSize: number;
}
export class PaymentFilterError extends Error {}
const value = (input: unknown, max = 200) => typeof input === "string" ? input.trim().slice(0, max) : "";
function date(input: unknown): string {
  const text = value(input, 32);
  if (!text) return "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || !Number.isFinite(Date.parse(text)) ||
      new Date(text).toISOString().slice(0, 10) !== text) {
    throw new PaymentFilterError("Choose a valid effective date.");
  }
  return text;
}
export function normalizePaymentFilters(input: unknown): PaymentFilters {
  const data = input && typeof input === "object" ? input as Record<string, unknown> : {};
  const from = date(data.from), to = date(data.to);
  if (from && to && from > to) throw new PaymentFilterError("The start date must be on or before the end date.");
  const month = value(data.month, 7) || "all";
  if (month !== "all" && !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new PaymentFilterError("Choose a valid statement month.");
  const product = value(data.product, 40) || "all";
  if (product !== "all" && !PRODUCT_TYPES.some((type) => type.code === product)) throw new PaymentFilterError("Choose a supported product type.");
  const page = Number(data.page), size = Number(data.pageSize);
  return {
    search: value(data.search, 160), month, product,
    carrier: value(data.carrier) || "all", agent: value(data.agent) || "all", category: value(data.category) || "all",
    from, to, unassigned: data.unassigned === true,
    page: Number.isSafeInteger(page) && page > 0 ? page : 1,
    pageSize: [25, 50, 100].includes(size) ? size : 25,
  };
}
export function filterPaymentMetadata(rows: readonly CarrierTransactionRecord[], filters: PaymentFilters) {
  return rows.filter((row) =>
    (filters.month === "all" || row.statementMonth === filters.month) &&
    (filters.carrier === "all" || row.carrier === filters.carrier) &&
    (filters.agent === "all" || row.userId === filters.agent || row.writingUserId === filters.agent) &&
    (filters.category === "all" || row.commissionType === filters.category) &&
    (!filters.from || row.effectiveDate >= filters.from) && (!filters.to || row.effectiveDate <= filters.to) &&
    (!filters.unassigned || row.userId === null));
}
function tokens(text: string) {
  return text.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
}
export function searchPayments(rows: readonly CarrierTransactionRecord[], search: string, names: ReadonlyMap<string, string>) {
  const query = tokens(search);
  if (search.trim() && !query.length) return [];
  return rows.filter((row) => {
    const text = tokens(`${row.memberId} ${names.get(row.id) ?? ""}`).join(" ");
    return query.every((token) => text.includes(token));
  });
}
/** Totals always use the entire matching set, before slicing the requested page. */
export function paginatePayments(rows: readonly CarrierTransactionRecord[], filters: PaymentFilters) {
  const pages = Math.max(1, Math.ceil(rows.length / filters.pageSize));
  const page = Math.min(filters.page, pages);
  const start = (page - 1) * filters.pageSize;
  return {
    rows: rows.slice(start, start + filters.pageSize), page, pages,
    count: rows.length, start: rows.length ? start + 1 : 0, end: Math.min(start + filters.pageSize, rows.length),
    totalCents: sumCents(rows), categories: totalsByCategory(rows), unassignedCount: rows.filter((row) => row.userId === null).length,
  };
}