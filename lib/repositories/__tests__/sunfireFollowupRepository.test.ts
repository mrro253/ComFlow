import { beforeEach, describe, expect, it, vi } from "vitest";
import { readSunfireFollowups, appendSunfireFollowup } from "../sunfireFollowupRepository";
import type { CurrentUser } from "@/types/domain";
const mocks = vi.hoisted(() => ({ owner: vi.fn(), range: vi.fn(), insert: vi.fn(), eq: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ from: () => {
  const q = { select: () => q, eq: (...args: unknown[]) => { mocks.eq(...args); return q; }, single: mocks.owner }; return q;
} }) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: () => {
  const q = { select: () => q, eq: (...args: unknown[]) => { mocks.eq(...args); return q; }, order: () => q, range: mocks.range, insert: mocks.insert }; return q;
} }) }));
const user = { id: "owner", agencyId: "agency", role: "owner", active: true } as CurrentUser;
const hash = "a".repeat(64);
beforeEach(() => { vi.clearAllMocks(); mocks.owner.mockResolvedValue({ data: { id: user.id }, error: null }); mocks.range.mockResolvedValue({ data: [], error: null }); mocks.insert.mockResolvedValue({ error: null }); });
describe("private append-only SunFire follow-up notes", () => {
  it("checks current owner access and note limits before inserting", async () => {
    await expect(appendSunfireFollowup({ ...user, role: "agent" }, hash, "EXAMPLE", "Synthetic note")).rejects.toThrow("owner");
    await expect(appendSunfireFollowup(user, hash, "EXAMPLE", " ")).rejects.toThrow("note");
    await expect(appendSunfireFollowup(user, hash, "EXAMPLE", "x".repeat(2001))).rejects.toThrow("note");
    mocks.owner.mockResolvedValue({ data: null, error: null });
    await expect(appendSunfireFollowup(user, hash, "EXAMPLE", "Synthetic note")).rejects.toThrow("access"); expect(mocks.insert).not.toHaveBeenCalled();
  });
  it("reads only the owner/agency/collection and retains the newest explanation", async () => {
    const details = { version: 1, enrollmentCode: "EXAMPLE", status: "did_not_take_effect", note: "Current explanation" };
    mocks.range.mockResolvedValue({ data: [{ details, created_at: "2026-10-22T12:00:00Z" }, { details: { ...details, note: "Earlier explanation" }, created_at: "2026-10-22T11:00:00Z" }], error: null });
    const result = await readSunfireFollowups(user, hash); expect(result.EXAMPLE.note).toBe("Current explanation");
    expect(mocks.eq).toHaveBeenCalledWith("agency_id", user.agencyId); expect(mocks.eq).toHaveBeenCalledWith("actor_user_id", user.id); expect(mocks.eq).toHaveBeenCalledWith("entity_id", hash);
    mocks.range.mockResolvedValue({ data: [{ details: {} }], error: null }); await expect(readSunfireFollowups(user, hash)).rejects.toThrow("Invalid");
  });
  it("makes retrying the same note idempotent and propagates save failures", async () => {
    await appendSunfireFollowup(user, hash, "EXAMPLE", "Synthetic note"); await appendSunfireFollowup(user, hash, "EXAMPLE", "Synthetic note");
    expect(mocks.insert.mock.calls[0][0]).toEqual(mocks.insert.mock.calls[1][0]);
    expect(mocks.insert.mock.calls[0][0]).toMatchObject({ agency_id: user.agencyId, actor_user_id: user.id, details: { enrollmentCode: "EXAMPLE", status: "did_not_take_effect", note: "Synthetic note" } });
    mocks.insert.mockResolvedValue({ error: { code: "unavailable" } }); await expect(appendSunfireFollowup(user, hash, "EXAMPLE", "Synthetic note")).rejects.toThrow("Could not save");
  });
  it("skips the latest identical explanation but permits a later revision back to older wording", async () => {
    const details = { version: 1, enrollmentCode: "EXAMPLE", status: "did_not_take_effect", note: "Synthetic note" };
    mocks.range.mockResolvedValue({ data: [{ details, created_at: "2026-10-22T12:00:00Z" }], error: null });
    await appendSunfireFollowup(user, hash, "EXAMPLE", "Synthetic note"); expect(mocks.insert).not.toHaveBeenCalled();
    mocks.range.mockResolvedValue({ data: [{ details: { ...details, note: "Different note" }, created_at: "2026-10-22T13:00:00Z" }], error: null });
    await appendSunfireFollowup(user, hash, "EXAMPLE", "Synthetic note"); expect(mocks.insert).toHaveBeenCalledTimes(1);
  });
});
