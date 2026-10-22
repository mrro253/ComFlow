import { beforeEach, describe, expect, it, vi } from "vitest";
import { readConfirmedSunfireLinks, appendSunfireLinkConfirmation } from "../sunfireLinkRepository";
import type { CurrentUser } from "@/types/domain";
const mocks = vi.hoisted(() => ({ owner: vi.fn(), range: vi.fn(), insert: vi.fn(), eq: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ from: () => {
  const q = { select: () => q, eq: (...args: unknown[]) => { mocks.eq(...args); return q; }, single: mocks.owner }; return q;
} }) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: () => {
  const q = { select: () => q, eq: (...args: unknown[]) => { mocks.eq(...args); return q; }, order: () => q, range: mocks.range, insert: mocks.insert }; return q;
} }) }));
const user = { id: "owner", agencyId: "agency", role: "owner", active: true } as CurrentUser;
const hash = "a".repeat(64), links = [{ enrollmentCode: "EXAMPLE", evidenceHash: "b".repeat(64), entryIds: ["entry"] }];
beforeEach(() => { vi.clearAllMocks(); mocks.owner.mockResolvedValue({ data: { id: user.id }, error: null }); mocks.range.mockResolvedValue({ data: [], error: null }); mocks.insert.mockResolvedValue({ error: null }); });
describe("scoped append-only enrollment link audit events", () => {
  it("rejects inactive owners, other roles and revoked owner access before writing", async () => {
    await expect(appendSunfireLinkConfirmation({ ...user, active: false }, hash, links)).rejects.toThrow("owner");
    await expect(readConfirmedSunfireLinks({ ...user, role: "agent" }, hash)).rejects.toThrow("owner");
    mocks.owner.mockResolvedValue({ data: null, error: null });
    await expect(appendSunfireLinkConfirmation(user, hash, links)).rejects.toThrow("access"); expect(mocks.insert).not.toHaveBeenCalled();
  });
  it("scopes event reads to agency, actor and collection and rejects malformed events", async () => {
    mocks.range.mockResolvedValueOnce({ data: [{ details: { version: 1, links } }], error: null });
    expect(await readConfirmedSunfireLinks(user, hash)).toEqual(links);
    expect(mocks.eq).toHaveBeenCalledWith("agency_id", user.agencyId); expect(mocks.eq).toHaveBeenCalledWith("actor_user_id", user.id); expect(mocks.eq).toHaveBeenCalledWith("entity_id", hash);
    mocks.range.mockResolvedValueOnce({ data: [{ details: { version: 2 } }], error: null });
    await expect(readConfirmedSunfireLinks(user, hash)).rejects.toThrow("Invalid");
  });
  it("writes a deterministic batch event and propagates storage failures", async () => {
    await appendSunfireLinkConfirmation(user, hash, links); await appendSunfireLinkConfirmation(user, hash, links);
    expect(mocks.insert.mock.calls[0][0]).toEqual(mocks.insert.mock.calls[1][0]);
    expect(mocks.insert.mock.calls[0][0]).toMatchObject({ agency_id: user.agencyId, actor_user_id: user.id, entity_id: hash, details: { version: 1, links } });
    mocks.insert.mockResolvedValue({ error: { code: "unavailable" } });
    await expect(appendSunfireLinkConfirmation(user, hash, links)).rejects.toThrow("Could not save");
  });
});
