import { beforeEach, describe, expect, it, vi } from "vitest";
import { readSunfireCollection } from "../sunfireCollectionRepository";
import { syntheticSunfireCollection } from "@/lib/enrollments/__fixtures__/sunfireCollection";
import { sunfireCollectionBytes, sunfireCollectionHash } from "@/lib/enrollments/sunfire";
import type { CurrentUser } from "@/types/domain";
const mock = vi.hoisted(() => ({ authorized: true, download: vi.fn(), admin: vi.fn(), filters: [] as [string, unknown][] }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ from: () => {
  const query = { select: () => query, eq: (key: string, value: unknown) => { mock.filters.push([key, value]); return query; }, maybeSingle: async () => ({ data: mock.authorized ? { id: "33333333-3333-4333-8333-333333333333" } : null, error: null }) }; return query;
} }) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => { mock.admin(); return { storage: { from: () => ({ download: mock.download }) } }; } }));
const source = syntheticSunfireCollection();
const user = { id: source.userId, agencyId: source.agencyId, role: "owner", active: true } as CurrentUser;
beforeEach(() => { vi.clearAllMocks(); mock.filters.length = 0; mock.authorized = true; mock.download.mockResolvedValue({ error: null, data: new Blob([sunfireCollectionBytes(source)]) }); });
describe("SunFire private-source access", () => {
  it("denies nonowners, inactive users, invalid references and unavailable own connections before admin storage", async () => {
    const hash = sunfireCollectionHash(source);
    await expect(readSunfireCollection({ ...user, role: "agent" }, hash)).rejects.toThrow();
    await expect(readSunfireCollection({ ...user, active: false }, hash)).rejects.toThrow();
    await expect(readSunfireCollection(user, "../other")).rejects.toThrow();
    mock.authorized = false; await expect(readSunfireCollection(user, hash)).rejects.toThrow();
    expect(mock.admin).not.toHaveBeenCalled();
  });
  it("requires an agency-and-user-scoped connection and validates the stored owner binding and bytes", async () => {
    const hash = sunfireCollectionHash(source);
    expect((await readSunfireCollection(user, hash)).count).toBe(1);
    expect(mock.filters).toEqual(expect.arrayContaining([["agency_id", user.agencyId], ["user_id", user.id], ["carrier", "SunFire"]]));
    expect(mock.download.mock.calls[0][0]).toBe(`${source.agencyId}/sunfire-enrollments/${source.userId}/${source.connectionId}/${hash}.json`);
    mock.download.mockResolvedValue({ error: null, data: new Blob([JSON.stringify({ ...source, userId: "44444444-4444-4444-8444-444444444444" })]) });
    await expect(readSunfireCollection(user, hash)).rejects.toThrow("integrity");
    mock.download.mockResolvedValue({ error: null, data: new Blob([JSON.stringify({ ...source, records: [{ ...source.records[0], plan: "Changed plan" }] })]) });
    await expect(readSunfireCollection(user, hash)).rejects.toThrow("integrity");
  });
});
