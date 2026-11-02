import { beforeEach, describe, expect, it, vi } from "vitest";
import { queryPayments, queryClientCommissionHistory } from "../actions";
const mocks = vi.hoisted(() => ({ require: vi.fn(), load: vi.fn(), history: vi.fn() }));
vi.mock("@/lib/services/clientCommissionHistoryService", () => ({ loadClientCommissionHistory: mocks.history }));
vi.mock("@/lib/auth/requireRole", () => ({ requireRole: mocks.require }));
vi.mock("@/lib/services/paymentLedgerService", () => ({ loadPaymentLedger: mocks.load }));
beforeEach(() => { vi.resetAllMocks(); });

describe("client history action", () => {
  const transactionId = "ed230000-0000-4000-8000-000000000123";
  it("accepts a standard five-segment UUID and uses the current session", async () => {
    const user = { id: "actor", agencyId: "agency" };
    mocks.require.mockResolvedValue(user); mocks.history.mockResolvedValue({ count: 1 });
    expect(await queryClientCommissionHistory({ transactionId, page: 2, agencyId: "forged" })).toEqual({ data: { count: 1 } });
    expect(mocks.history).toHaveBeenCalledWith(user, transactionId, 2);
  });
  it("rejects malformed identifiers and invalid pages before reading history", async () => {
    mocks.require.mockResolvedValue({ id: "actor" });
    for (const input of [{ transactionId: "ed230000-0000-4000-000000000123" }, { transactionId, page: 0 }, { transactionId, page: 1.5 }]) {
      expect((await queryClientCommissionHistory(input)).error).toContain("valid");
    }
    expect(mocks.history).not.toHaveBeenCalled();
  });
  it("requires authentication and does not expose internal errors", async () => {
    mocks.require.mockRejectedValue(new Error("private session information"));
    expect((await queryClientCommissionHistory({ transactionId })).error).not.toContain("private");
    expect(mocks.history).not.toHaveBeenCalled();
  });
});
describe("private payment search action", () => {
  it("requires authentication before querying payment records", async () => {
    mocks.require.mockRejectedValue(new Error("unauthorized"));
    const result = await queryPayments({ search: "Synthetic Client" });
    expect(result.error).toContain("sign-in"); expect(mocks.load).not.toHaveBeenCalled();
  });
  it("uses the authenticated user rather than any client-supplied agency", async () => {
    const user = { id: "current-user", agencyId: "current-agency" };
    mocks.require.mockResolvedValue(user); mocks.load.mockResolvedValue({ count: 1 });
    const input = { search: "Synthetic", agencyId: "other-agency" };
    expect((await queryPayments(input)).data).toEqual({ count: 1 });
    expect(mocks.load).toHaveBeenCalledWith(user, input);
  });
  it("does not echo source or search content in unexpected errors", async () => {
    mocks.require.mockResolvedValue({ id: "user" }); mocks.load.mockRejectedValue(new Error("Synthetic private name"));
    const result = await queryPayments({ search: "Synthetic private name" });
    expect(result.error).not.toContain("private name");
  });
});
