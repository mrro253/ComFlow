import { describe, expect, it } from "vitest";
import type { CarrierTransactionRecord } from "@/lib/repositories/statementRepository";
import { clientCommissionHistory } from "./clientCommissionHistory";

const base: CarrierTransactionRecord = { id: "seed", statementId: "january", carrier: "Synthetic Carrier", statementMonth: "2026-01", memberId: "000123", effectiveDate: "2026-01-01", commissionType: "INITIAL", amountCents: 12001, writingAgentName: "Example Writer", writingAgentVerified: true, userId: "credited-agent", writingUserId: null };
describe("client commission history", () => {
  it("sums signed cents across months and preserves category labels without inferring status", () => {
    const rows = [base, { ...base, id: "renewal", statementId: "february", statementMonth: "2026-02", commissionType: "RENEWAL", amountCents: 2501 }, { ...base, id: "adjustment", statementId: "february", statementMonth: "2026-02", commissionType: "ADJUSTMENT", amountCents: -103 }];
    const result = clientCommissionHistory(rows, base.id)!;
    expect(result.totalCents).toBe(14399);
    expect(result.positiveCents).toBe(14502);
    expect(result.negativeCents).toBe(-103);
    expect(result.statementCount).toBe(2);
    expect(result.count).toBe(3);
    expect(result.months).toEqual([{ month: "2026-02", cents: 2398, entries: 2, statementCount: 1 }, { month: "2026-01", cents: 12001, entries: 1, statementCount: 1 }]);
    expect(result.rows.map((r) => r.commissionType)).toContain("ADJUSTMENT");
  });
  it("keeps carriers, credited agents, writers and exact member identifiers separate", () => {
    const others = [{ carrier: "Other Carrier" }, { userId: "other-agent" }, { userId: null }, { writingUserId: "other-writer" }, { writingAgentName: "Another Writer" }, { memberId: "123" }];
    const rows = [base, ...others.map((change, i) => ({ ...base, id: `other-${i}`, ...change }))];
    expect(clientCommissionHistory(rows, base.id)?.count).toBe(1);
  });
  it("normalizes writer name formatting only, without using client names as identity", () => {
    expect(clientCommissionHistory([base, { ...base, id: "other-month", writingAgentName: " example   WRITER " }], base.id)?.count).toBe(2);
  });
  it("does not merge a writer user ID with a matching raw writer name", () => {
    expect(clientCommissionHistory([{ ...base, writingUserId: "example" }, { ...base, id: "other", writingAgentName: "example" }], base.id)?.count).toBe(1);
  });
  it("refuses missing, masked or placeholder member IDs and unavailable seeds", () => {
    expect(clientCommissionHistory([base], "invisible")).toBeNull();
    for (const memberId of ["", " ", "N/A", "UNKNOWN", "***123", "--"]) expect(clientCommissionHistory([{ ...base, memberId }], base.id)).toBeNull();
  });
  it("paginates without limiting totals or changing input order", () => {
    const rows = Array.from({ length: 31 }, (_, i) => ({ ...base, id: `row-${String(i).padStart(2, "0")}`, amountCents: 101 }));
    const result = clientCommissionHistory(rows, "row-00", 2)!;
    expect(result.rows).toHaveLength(6); expect(result.start).toBe(26); expect(result.end).toBe(31);
    expect(result.totalCents).toBe(3131); expect(result.count).toBe(31);
    expect(clientCommissionHistory(rows, "row-00", 100)?.page).toBe(2);
    expect(clientCommissionHistory(rows, "row-00", NaN)?.page).toBe(1);
    expect(rows[0].id).toBe("row-00");
  });
  it("preserves legitimate identical entries rather than deduplicating them", () => {
    expect(clientCommissionHistory([base, { ...base, id: "legitimate-second-entry" }], base.id)?.totalCents).toBe(24002);
  });
});
