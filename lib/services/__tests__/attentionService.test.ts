import { beforeEach, describe, expect, it, vi } from "vitest";
import { getAttention, acknowledgeChargeback } from "../attentionService";
import { chargebackKey } from "@/lib/reporting/attention";
import type { CurrentUser } from "@/types/domain";
import type { CarrierTransactionRecord } from "@/lib/repositories/statementRepository";
const mocks = vi.hoisted(() => ({ transactions: vi.fn(), statements: vi.fn(), connections: vi.fn(), reviewed: vi.fn(), append: vi.fn(), matches: vi.fn(), followups: vi.fn(), events: vi.fn(), details: vi.fn() }));
vi.mock("@/lib/repositories/statementRepository", () => ({ listVisibleTransactions: mocks.transactions, listStatementCoverage: mocks.statements }));
vi.mock("@/lib/repositories/carrierConnectionRepository", () => ({ listVisibleConnections: mocks.connections }));
vi.mock("@/lib/repositories/attentionRepository", () => ({ reviewedAttentionKeys: mocks.reviewed, appendChargebackReview: mocks.append }));
vi.mock("@/lib/services/sunfireMatchService", () => ({ getSunfireMatches: mocks.matches }));
vi.mock("@/lib/repositories/sunfireFollowupRepository", () => ({ readSunfireFollowups: mocks.followups }));
vi.mock("@/lib/repositories/saleDispositionRepository", () => ({ readSaleEvents: mocks.events }));
vi.mock("@/lib/services/paymentDetailsService", () => ({ loadPaymentDetails: mocks.details }));
vi.mock("@/lib/repositories/devotedInboxRepository", () => ({ listDevotedInbox: async () => [] }));
const user = { id: "user", agencyId: "agency", role: "agent", agentType: "career", active: true } as CurrentUser;
const entry = { id: "entry", statementId: "statement", amountCents: -10000, effectiveDate: "2026-03-01", commissionType: "CHARGEBACK" } as CarrierTransactionRecord;
beforeEach(() => { vi.clearAllMocks(); mocks.transactions.mockResolvedValue([]); mocks.statements.mockResolvedValue([]); mocks.connections.mockResolvedValue([]); mocks.reviewed.mockResolvedValue(new Set()); mocks.matches.mockResolvedValue({ current: null, matches: [] }); mocks.details.mockResolvedValue(new Map()); });
describe("role-scoped attention service", () => {
  it("does not load agency administration or source-owner data for career agents", async () => {
    const result = await getAttention(user); expect(result.statements).toEqual([]); expect(result.sales).toEqual([]); expect(result.connectionSetupNeeded).toBe(false);
    expect(mocks.statements).not.toHaveBeenCalled(); expect(mocks.connections).not.toHaveBeenCalled(); expect(mocks.matches).not.toHaveBeenCalled();
  });
  it("never reports all clear when an authorized source check fails", async () => {
    mocks.transactions.mockRejectedValue(new Error("Unavailable")); await expect(getAttention(user)).rejects.toThrow("Unavailable");
    await expect(getAttention({ ...user, active: false })).rejects.toThrow("Active account");
  });
  it("only acknowledges a currently visible chargeback with matching evidence", async () => {
    mocks.transactions.mockResolvedValue([entry]);
    await expect(acknowledgeChargeback(user, "forged")).rejects.toThrow("unavailable"); expect(mocks.append).not.toHaveBeenCalled();
    await acknowledgeChargeback(user, chargebackKey(entry)); expect(mocks.append).toHaveBeenCalledWith(user, chargebackKey(entry));
    mocks.transactions.mockResolvedValue([{ ...entry, commissionType: "COMMISSION" }]);
    await expect(acknowledgeChargeback(user, chargebackKey(entry))).rejects.toThrow("unavailable");
  });
  it("does not turn absent statements or unknown sales into owner chores", async () => {
    mocks.connections.mockResolvedValue([{ userId: user.id, status: "active" }]);
    mocks.matches.mockResolvedValue({ current: { hash: "a".repeat(64) }, matches: [{ enrollmentCode: "EXAMPLE", status: "no_statements", evidence: [], sharedEvidence: false }] });
    mocks.followups.mockResolvedValue({}); mocks.events.mockResolvedValue([]);
    const result = await getAttention({ ...user, role: "owner" }); expect(result.sales).toEqual([]); expect(result.connectionSetupNeeded).toBe(false);
    expect(mocks.connections).toHaveBeenCalledWith(true);
  });
  it("only shows source-verified chargeback names and fails safely if details are unavailable", async () => {
    mocks.transactions.mockResolvedValue([entry]); await expect(getAttention(user)).rejects.toThrow("verify chargeback");
    mocks.details.mockResolvedValue(new Map([[entry.id, { clientName: "Example Person", fields: [{ label: "Notes", value: "Synthetic reversal reason" }] }]]));
    const result = await getAttention(user); expect(result.chargebacks[0].clientName).toBe("Example Person"); expect(result.chargebacks[0].carrierNote).toBe("Synthetic reversal reason");
    expect(mocks.details).toHaveBeenCalledWith([entry.id], user.agencyId);
  });
});
