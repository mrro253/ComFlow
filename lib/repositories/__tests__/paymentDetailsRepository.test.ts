import { beforeEach, describe, expect, it, vi } from "vitest";
import { listVisiblePaymentSources } from "../paymentDetailsRepository";
const mocks = vi.hoisted(() => ({ from: vi.fn(), select: vi.fn(), eq: vi.fn(), in: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ from: mocks.from }) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
beforeEach(() => {
  vi.resetAllMocks();
  const builder = { select: mocks.select, eq: mocks.eq, in: mocks.in };
  mocks.from.mockReturnValue(builder); mocks.select.mockReturnValue(builder); mocks.eq.mockReturnValue(builder);
  mocks.in.mockImplementation(async (_: string, ids: string[]) => ({ data: ids.map((id) => ({ id })), error: null }));
});
describe("bounded RLS-scoped payment source lookup", () => {
  it("chunks large searches and applies the session agency to every query", async () => {
    const ids = Array.from({ length: 235 }, (_, i) => `synthetic-${i}`);
    const rows = await listVisiblePaymentSources([...ids, ids[0]], "agency-1");
    expect(rows).toHaveLength(235); expect(mocks.in).toHaveBeenCalledTimes(3);
    expect(mocks.in.mock.calls.map((call) => call[1].length)).toEqual([100, 100, 35]);
    expect(mocks.eq).toHaveBeenCalledTimes(3);
    expect(mocks.eq.mock.calls.every((args) => args[0] === "agency_id" && args[1] === "agency-1")).toBe(true);
  });
  it("does not query an empty ID list", async () => {
    expect(await listVisiblePaymentSources([], "agency-1")).toEqual([]); expect(mocks.from).not.toHaveBeenCalled();
  });
  it("returns a generic error on failed reads", async () => {
    mocks.in.mockResolvedValue({ data: null, error: { message: "synthetic private content" } });
    await expect(listVisiblePaymentSources(["id"], "agency-1")).rejects.toThrow("Could not load payment sources");
  });
});