import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadPaymentLedger } from "../paymentLedgerService";
import type { CurrentUser } from "@/types/domain";
import type { CarrierTransactionRecord } from "@/lib/repositories/statementRepository";
const mocks = vi.hoisted(() => ({ rows: vi.fn(), team: vi.fn(), details: vi.fn() }));
vi.mock("@/lib/repositories/statementRepository", () => ({ listVisibleTransactions: mocks.rows }));
vi.mock("@/lib/repositories/userRepository", () => ({ listUsersForAgency: mocks.team }));
vi.mock("@/lib/services/paymentDetailsService", () => ({ loadPaymentDetails: mocks.details }));
const user = { agencyId: "agency-1", role: "owner" } as CurrentUser;
const rows: CarrierTransactionRecord[] = Array.from({ length: 60 }, (_, i) => ({ id: `p-${i}`, statementId: "s1", carrier: "Synthetic Carrier", statementMonth: "2026-06", memberId: `UL${9000000 + i}`, effectiveDate: "2026-01-01", commissionType: "RENEWAL", amountCents: 100, writingAgentName: "DEMO WRITER", writingAgentVerified: true, userId: "agent-1", writingUserId: null }));
beforeEach(() => {
  vi.resetAllMocks(); mocks.rows.mockResolvedValue(rows);
  mocks.team.mockResolvedValue([{ id: "agent-1", firstName: "Demo", lastName: "Agent", active: true }, { id: "hidden-agent", firstName: "Hidden", lastName: "Agent", active: true }]);
  mocks.details.mockImplementation(async (ids: string[]) => new Map(ids.map((id) => [id, { clientName: "Demo Client", fields: [] }])));
});
describe("payment ledger service", () => {
  it("returns only one page but totals the full RLS-visible matching set", async () => {
    const view = await loadPaymentLedger(user, { page: 2 });
    expect(view.count).toBe(60); expect(view.totalCents).toBe(6000); expect(view.rows).toHaveLength(25);
    expect(view.rows[0].id).toBe("p-25");
    expect(mocks.details).toHaveBeenCalledWith(rows.slice(25, 50).map((r) => r.id), "agency-1");
    expect(view.options.agents.map((a) => a.id)).toEqual(["agent-1"]);
  });
  it("searches names across candidates, not just the first page", async () => {
    mocks.details.mockResolvedValue(new Map(rows.map((row, i) => [row.id, { clientName: i >= 50 ? "Target Example" : "Other Client", fields: [] }])));
    const view = await loadPaymentLedger(user, { search: "example target" });
    expect(view.count).toBe(10); expect(view.totalCents).toBe(1000);
    expect(view.rows[0].id).toBe("p-50");
  });
  it("uses member ID search even when client details are unavailable", async () => {
    mocks.details.mockResolvedValue(new Map());
    const view = await loadPaymentLedger(user, { search: "UL9000059" });
    expect(view.rows.map((r) => r.id)).toEqual(["p-59"]); expect(view.rows[0].sourceDetails).toBeNull();
  });
  it("shows incomplete-name warnings instead of silently claiming a complete search", async () => {
    mocks.details.mockResolvedValue(new Map());
    const view = await loadPaymentLedger(user, { search: "Some Name" });
    expect(view.count).toBe(0); expect(view.warning).toContain("member ID");
  });
  it("narrows before reading PDFs and never widens access through an agent filter", async () => {
    const view = await loadPaymentLedger(user, { agent: "hidden-agent" });
    expect(view.count).toBe(0); expect(view.totalCents).toBe(0);
    expect(mocks.details).toHaveBeenCalledWith([], "agency-1");
  });
  it("disables the owner-only unassigned filter for agent requests", async () => {
    const view = await loadPaymentLedger({ ...user, role: "agent" }, { unassigned: true });
    expect(view.filters.unassigned).toBe(false); expect(view.count).toBe(60);
  });
  it("rejects invalid filters before reading any records", async () => {
    await expect(loadPaymentLedger(user, { month: "invalid" })).rejects.toThrow("month");
    expect(mocks.rows).not.toHaveBeenCalled();
  });
});