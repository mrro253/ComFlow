import { describe, expect, it } from "vitest";
import { filterPaymentMetadata, normalizePaymentFilters, paginatePayments, searchPayments } from "../paymentQuery";
import type { CarrierTransactionRecord } from "@/lib/repositories/statementRepository";
export function payment(overrides: Partial<CarrierTransactionRecord> = {}): CarrierTransactionRecord {
  return { id: "p1", statementId: "s1", carrier: "Synthetic Carrier", statementMonth: "2026-06", memberId: "UL9000001", effectiveDate: "2026-01-01", commissionType: "RENEWAL", amountCents: 10000, writingAgentName: "EXAMPLE, SAM", writingAgentVerified: true, userId: "agent-1", writingUserId: null, ...overrides };
}
describe("payment query", () => {
  it("combines all metadata filters and includes date boundaries", () => {
    const rows = [payment(), payment({ id: "other-carrier", carrier: "Other" }), payment({ id: "other-category", commissionType: "COMMISSION" }), payment({ id: "other-month", statementMonth: "2026-05" }), payment({ id: "other-agent", userId: "agent-2" }), payment({ id: "earlier", effectiveDate: "2025-12-31" })];
    const filters = normalizePaymentFilters({ month: "2026-06", carrier: "Synthetic Carrier", agent: "agent-1", category: "RENEWAL", from: "2026-01-01", to: "2026-01-01" });
    expect(filterPaymentMetadata(rows, filters).map((r) => r.id)).toEqual(["p1"]);
  });
  it("includes a captive writer and handles unassigned separately", () => {
    const rows = [payment({ writingUserId: "writer" }), payment({ id: "unassigned", userId: null })];
    expect(filterPaymentMetadata(rows, normalizePaymentFilters({ agent: "writer" }))).toHaveLength(1);
    expect(filterPaymentMetadata(rows, normalizePaymentFilters({ unassigned: true })).map((r) => r.id)).toEqual(["unassigned"]);
  });
  it("searches name tokens regardless of case, accents or comma order", () => {
    const rows = [payment()]; const names = new Map([["p1", "Sam Éxample"]]);
    expect(searchPayments(rows, "EXAMPLE, SAM", names)).toHaveLength(1);
    expect(searchPayments(rows, "sam ul9000001", names)).toHaveLength(1);
    expect(searchPayments(rows, "stranger", names)).toHaveLength(0);
    expect(searchPayments(rows, "ul900", new Map())).toHaveLength(1);
  });
  it("makes every row beyond the old 300-row cap reachable without duplicates", () => {
    const rows = Array.from({ length: 613 }, (_, i) => payment({ id: `p-${i}`, amountCents: i === 0 ? -125 : 200 }));
    const visited: string[] = [];
    for (let number = 1; number <= 25; number++) {
      const page = paginatePayments(rows, normalizePaymentFilters({ page: number }));
      visited.push(...page.rows.map((r) => r.id));
      expect(page.totalCents).toBe(122275); expect(page.count).toBe(613);
    }
    expect(new Set(visited).size).toBe(613); expect(visited).toHaveLength(613);
    expect(visited.at(-1)).toBe("p-612");
  });
  it("clamps page numbers, validates page sizes and leaves input order intact", () => {
    const rows = Array.from({ length: 51 }, (_, i) => payment({ id: `p-${i}` }));
    const before = JSON.stringify(rows);
    const result = paginatePayments(rows, normalizePaymentFilters({ page: 999, pageSize: 50 }));
    expect(result.page).toBe(2); expect(result.rows).toHaveLength(1); expect(result.start).toBe(51);
    expect(JSON.stringify(rows)).toBe(before);
    expect(normalizePaymentFilters({ page: -1, pageSize: 999 }).pageSize).toBe(25);
    expect(normalizePaymentFilters({ page: 1.5 }).page).toBe(1);
  });
  it("handles no matches and keeps negative amounts in full-result totals", () => {
    const empty = paginatePayments([], normalizePaymentFilters({ page: 40 }));
    expect(empty).toMatchObject({ page: 1, pages: 1, start: 0, end: 0, count: 0, totalCents: 0 });
    const rows = [payment({ amountCents: 12500 }), payment({ id: "negative", amountCents: -5000, commissionType: "CHARGEBACK" })];
    const result = paginatePayments(rows, normalizePaymentFilters({}));
    expect(result.totalCents).toBe(7500); expect(result.categories.find((c) => c.type === "CHARGEBACK")?.cents).toBe(-5000);
  });
  it("rejects invalid calendar dates, reversed ranges and malformed months", () => {
    expect(() => normalizePaymentFilters({ from: "2026-02-30" })).toThrow("valid effective date");
    expect(() => normalizePaymentFilters({ from: "2026-06-02", to: "2026-06-01" })).toThrow("start date");
    expect(() => normalizePaymentFilters({ month: "2026-13" })).toThrow("month");
    expect(normalizePaymentFilters(null).search).toBe("");
  });
});