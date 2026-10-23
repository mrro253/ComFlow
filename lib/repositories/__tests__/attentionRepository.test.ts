import { beforeEach, describe, expect, it, vi } from "vitest";
import { reviewedAttentionKeys, appendChargebackReview } from "../attentionRepository";
import type { CurrentUser } from "@/types/domain";
const mocks = vi.hoisted(() => ({ profile: vi.fn(), range: vi.fn(), insert: vi.fn(), eq: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ from: () => {
  const q = { select: () => q, eq: (...args: unknown[]) => { mocks.eq(...args); return q; }, single: mocks.profile }; return q;
} }) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: () => {
  const q = { select: () => q, eq: (...args: unknown[]) => { mocks.eq(...args); return q; }, order: () => q, range: mocks.range, insert: mocks.insert }; return q;
} }) }));
const user = { id: "agent", agencyId: "agency", role: "agent", active: true } as CurrentUser;
beforeEach(() => { vi.clearAllMocks(); mocks.profile.mockResolvedValue({ data: { id: user.id }, error: null }); mocks.range.mockResolvedValue({ data: [], error: null }); mocks.insert.mockResolvedValue({ error: null }); });
describe("private attention review receipts", () => {
  it("checks active profile and scopes reads to the current agency and reviewer", async () => {
    mocks.range.mockResolvedValueOnce({ data: [{ entity_id: "a".repeat(64) }], error: null });
    expect(await reviewedAttentionKeys(user)).toEqual(new Set(["a".repeat(64)]));
    expect(mocks.eq).toHaveBeenCalledWith("agency_id", user.agencyId); expect(mocks.eq).toHaveBeenCalledWith("actor_user_id", user.id);
    mocks.profile.mockResolvedValue({ data: null, error: null }); await expect(reviewedAttentionKeys(user)).rejects.toThrow("access");
    await expect(appendChargebackReview({ ...user, active: false }, "a".repeat(64))).rejects.toThrow("Active"); expect(mocks.insert).not.toHaveBeenCalled();
  });
  it("makes repeat review clicks idempotent without financial row writes", async () => {
    await appendChargebackReview(user, "a".repeat(64)); await appendChargebackReview(user, "a".repeat(64));
    expect(mocks.insert.mock.calls[0][0]).toEqual(mocks.insert.mock.calls[1][0]);
    expect(mocks.insert.mock.calls[0][0]).toMatchObject({ agency_id: user.agencyId, actor_user_id: user.id, action: "attention.chargeback_reviewed", entity_id: "a".repeat(64) });
    await expect(appendChargebackReview(user, "bad")).rejects.toThrow("Invalid");
    mocks.insert.mockResolvedValue({ error: { code: "unavailable" } }); await expect(appendChargebackReview(user, "a".repeat(64))).rejects.toThrow("Could not save");
  });
  it("fails visibly instead of hiding items when review history is corrupt or unavailable", async () => {
    mocks.range.mockResolvedValueOnce({ data: [{ entity_id: "bad" }], error: null }); await expect(reviewedAttentionKeys(user)).rejects.toThrow("Invalid");
    mocks.range.mockResolvedValueOnce({ data: null, error: {} }); await expect(reviewedAttentionKeys(user)).rejects.toThrow("Could not read");
  });
});
