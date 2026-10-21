import { beforeEach, expect, it, vi } from "vitest";
import { listStatementAmounts } from "./statementTotalsRepository";
const mocks = vi.hoisted(() => ({ range: vi.fn(), eq: vi.fn(), order: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ from: () => ({ select: () => ({ eq: mocks.eq }) }) }) }));
beforeEach(() => {
  vi.resetAllMocks();
  const chain = { eq: mocks.eq, order: mocks.order, range: mocks.range };
  mocks.eq.mockReturnValue(chain); mocks.order.mockReturnValue(chain);
});
it("reads past the usual display cap with stable ordering and agency/statement scope", async () => {
  const data = Array.from({ length: 1201 }, (_, i) => ({ id: String(i), amount_cents: 101 }));
  mocks.range.mockImplementation(async (from, to) => ({ data: data.slice(from, to + 1), error: null }));
  const amounts = await listStatementAmounts("statement", "agency");
  expect(amounts).toHaveLength(1201); expect(amounts.reduce((sum, n) => sum + n, 0)).toBe(121301);
  expect(mocks.eq).toHaveBeenCalledWith("agency_id", "agency");
  expect(mocks.eq).toHaveBeenCalledWith("statement_id", "statement");
  expect(mocks.order).toHaveBeenCalledWith("id"); expect(mocks.range).toHaveBeenCalledTimes(3);
});
it("never returns a partial total after a later page fails", async () => {
  mocks.range.mockResolvedValueOnce({ data: Array.from({ length: 500 }, () => ({ amount_cents: 100 })), error: null }).mockResolvedValueOnce({ data: null, error: { message: "private" } });
  await expect(listStatementAmounts("statement", "agency")).rejects.toThrow("Could not read all statement amounts");
});
