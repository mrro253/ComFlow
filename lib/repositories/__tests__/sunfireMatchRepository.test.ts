import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadSunfireMatchInventory } from "../sunfireMatchRepository";
import type { CurrentUser } from "@/types/domain";
const mock = vi.hoisted(() => ({ client: vi.fn(), filters: [] as unknown[][], pages: [] as unknown[][], source: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => { mock.client(); return { from: (table: string) => {
  const query = { select: () => query, eq: (key: string, value: unknown) => { mock.filters.push([table, key, value]); return query; }, is: (key: string, value: unknown) => { mock.filters.push([table, key, value]); return query; }, in: (key: string, value: unknown) => { mock.filters.push([table, key, value]); return query; }, order: () => query,
    range: async (start: number, end: number) => { mock.pages.push([table, start, end]); return { error: null, data: table === "commission_statements" ? [{ id: "statement", carrier: "Ultimate Health Plans" }] : start === 0 ? Array.from({ length: 500 }, (_, i) => ({ id: `row-${i}`, statement_id: "shared-source" })) : [{ id: "row-500", statement_id: "retired-source" }] }; } }; return query;
} }; } }));

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: (table: string) => {
  const q = { select: () => q, eq: (key: string, value: unknown) => { mock.filters.push(["admin", table, key, value]); return q; }, is: (key: string, value: unknown) => { mock.filters.push(["admin", table, key, value]); return q; }, in: mock.source }; return q;
} }) }));
const user = { id: "owner", agencyId: "agency", role: "owner", active: true } as CurrentUser;
beforeEach(() => { vi.clearAllMocks(); mock.filters.length = 0; mock.pages.length = 0; mock.source.mockResolvedValue({ data: [{ id: "shared-source" }], error: null }); });
describe("SunFire comparison inventory scope", () => {
  it("rejects inactive users before session data access", async () => {
    await expect(loadSunfireMatchInventory({ ...user, active: false })).rejects.toThrow(); expect(mock.client).not.toHaveBeenCalled();
  });
  it("authorizes agent rows through session RLS before resolving shared source metadata", async () => {
    const result = await loadSunfireMatchInventory({ ...user, role: "agent" });
    expect(result.entries).toHaveLength(500);
    expect(mock.source).toHaveBeenCalledWith("id", ["shared-source", "retired-source"]);
    expect(mock.filters).toContainEqual(["admin", "commission_statements", "agency_id", user.agencyId]);
    expect(mock.filters).toContainEqual(["admin", "commission_statements", "status", "imported"]);
    expect(mock.filters).toContainEqual(["admin", "commission_statements", "superseded_at", null]);
  });
  it("pages all entry rows and restricts both queries to active imported agency sources", async () => {
    const result = await loadSunfireMatchInventory(user); expect(result.entries).toHaveLength(501);
    expect(mock.filters).toEqual(expect.arrayContaining([["commission_statements", "agency_id", "agency"], ["commission_statements", "status", "imported"], ["commission_statements", "superseded_at", null], ["carrier_transactions", "agency_id", "agency"], ["carrier_transactions", "superseded_at", null], ["carrier_transactions", "statement_id", ["statement"]]]));
    expect(mock.pages).toContainEqual(["carrier_transactions", 500, 999]);
  });
});
