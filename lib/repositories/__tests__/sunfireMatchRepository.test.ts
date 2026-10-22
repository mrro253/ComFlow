import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadSunfireMatchInventory } from "../sunfireMatchRepository";
import type { CurrentUser } from "@/types/domain";
const mock = vi.hoisted(() => ({ client: vi.fn(), filters: [] as unknown[][], pages: [] as unknown[][] }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => { mock.client(); return { from: (table: string) => {
  const query = { select: () => query, eq: (key: string, value: unknown) => { mock.filters.push([table, key, value]); return query; }, is: (key: string, value: unknown) => { mock.filters.push([table, key, value]); return query; }, in: (key: string, value: unknown) => { mock.filters.push([table, key, value]); return query; }, order: () => query,
    range: async (start: number, end: number) => { mock.pages.push([table, start, end]); return { error: null, data: table === "commission_statements" ? [{ id: "statement", carrier: "Ultimate Health Plans" }] : start === 0 ? Array.from({ length: 500 }, (_, i) => ({ id: `row-${i}` })) : [{ id: "row-500" }] }; } }; return query;
} }; } }));
const user = { id: "owner", agencyId: "agency", role: "owner", active: true } as CurrentUser;
beforeEach(() => { vi.clearAllMocks(); mock.filters.length = 0; mock.pages.length = 0; });
describe("SunFire comparison inventory scope", () => {
  it("checks active owner before session data access", async () => {
    await expect(loadSunfireMatchInventory({ ...user, role: "agent" })).rejects.toThrow(); expect(mock.client).not.toHaveBeenCalled();
  });
  it("pages all entry rows and restricts both queries to active imported agency sources", async () => {
    const result = await loadSunfireMatchInventory(user); expect(result.entries).toHaveLength(501);
    expect(mock.filters).toEqual(expect.arrayContaining([["commission_statements", "agency_id", "agency"], ["commission_statements", "status", "imported"], ["commission_statements", "superseded_at", null], ["carrier_transactions", "agency_id", "agency"], ["carrier_transactions", "superseded_at", null], ["carrier_transactions", "statement_id", ["statement"]]]));
    expect(mock.pages).toContainEqual(["carrier_transactions", 500, 999]);
  });
});
