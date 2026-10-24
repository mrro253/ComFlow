import { beforeEach, describe, expect, it, vi } from "vitest";
import { getCurrentUser } from "../getCurrentUser";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), profile: vi.fn(), from: vi.fn(), map: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getUser: mocks.auth }, from: mocks.from }) }));
vi.mock("@/lib/repositories/userRepository", () => ({ mapUserRow: mocks.map }));
beforeEach(() => {
  vi.clearAllMocks(); mocks.auth.mockResolvedValue({ data: { user: { id: "actor" } } });
  const q = { select: () => q, eq: () => q, single: mocks.profile }; mocks.from.mockReturnValue(q);
  mocks.profile.mockResolvedValue({ data: { id: "actor", active: true }, error: null });
  mocks.map.mockReturnValue({ id: "actor", active: true });
});
describe("active signed-in account boundary", () => {
  it("returns an active authenticated profile", async () => {
    expect(await getCurrentUser()).toEqual({ authUserId: "actor", id: "actor", active: true });
  });
  it("rejects an inactive profile even while its auth session remains valid", async () => {
    mocks.profile.mockResolvedValue({ data: { id: "actor", active: false }, error: null });
    expect(await getCurrentUser()).toBeNull(); expect(mocks.map).not.toHaveBeenCalled();
  });
  it("fails closed for absent profiles, failed reads and missing auth", async () => {
    mocks.profile.mockResolvedValue({ data: null, error: null }); expect(await getCurrentUser()).toBeNull();
    mocks.profile.mockResolvedValue({ data: { active: true }, error: {} }); expect(await getCurrentUser()).toBeNull();
    mocks.auth.mockResolvedValue({ data: { user: null } }); mocks.from.mockClear();
    expect(await getCurrentUser()).toBeNull(); expect(mocks.from).not.toHaveBeenCalled();
  });
});
