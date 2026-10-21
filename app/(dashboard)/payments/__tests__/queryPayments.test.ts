import { beforeEach, describe, expect, it, vi } from "vitest";
import { queryPayments } from "../actions";
const mocks = vi.hoisted(() => ({ require: vi.fn(), load: vi.fn() }));
vi.mock("@/lib/auth/requireRole", () => ({ requireRole: mocks.require }));
vi.mock("@/lib/services/paymentLedgerService", () => ({ loadPaymentLedger: mocks.load }));
beforeEach(() => { vi.resetAllMocks(); });
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