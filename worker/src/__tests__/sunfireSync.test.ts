import { describe, expect, it, vi } from "vitest";
import { storeSunfireCollection } from "../sunfireSync";
import { syntheticSunfireCollection } from "../../../lib/enrollments/__fixtures__/sunfireCollection";
import type { ConnectionRow, Db } from "../db";
function storageFixture() {
  const files = new Map<string, Buffer>(), tables: string[] = [];
  let disabled = false, corrupt = false, inactive = false;
  const upload = vi.fn(async (path: string, bytes: Buffer) => {
    if (files.has(path)) return { error: { statusCode: "409", message: "The resource already exists" } };
    files.set(path, bytes); return { error: null };
  });
  const db = { from: (table: string) => { tables.push(table); const query = { select: () => query, eq: () => query, maybeSingle: async () => ({ error: null, data: table === "users" ? { role: "owner", active: !inactive } : { status: disabled ? "disabled" : "active" } }) }; return query; },
    storage: { from: () => ({ upload, download: async (path: string) => ({ error: null, data: new Blob([Uint8Array.from(corrupt ? Buffer.from("corrupt") : files.get(path)!)]) }) }) } } as unknown as Db;
  return { db, files, tables, upload, disable: () => { disabled = true; }, deactivate: () => { inactive = true; }, corrupt: () => { corrupt = true; } };
}
const source = syntheticSunfireCollection();
const connection = { id: source.connectionId, agency_id: source.agencyId, user_id: source.userId, carrier: "SunFire" } as ConnectionRow;
describe("SunFire collection preservation", () => {
  it("reuses unchanged sources and creates a separate source for corrections without writing financial tables", async () => {
    const fixture = storageFixture();
    expect(await storeSunfireCollection(fixture.db, connection, source.start, source.end, source.records)).toEqual({ count: 1, duplicate: false });
    expect(await storeSunfireCollection(fixture.db, connection, source.start, source.end, source.records)).toEqual({ count: 1, duplicate: true });
    await storeSunfireCollection(fixture.db, connection, source.start, source.end, [{ ...source.records[0], proposedEffectiveDate: "2026-03-01" }]);
    expect(fixture.files.size).toBe(2); expect(new Set(fixture.tables)).toEqual(new Set(["users", "carrier_connections"]));
  });
  it("stops before publishing a disconnected or invalid collection and detects corrupt saved bytes", async () => {
    const fixture = storageFixture(); fixture.disable();
    await expect(storeSunfireCollection(fixture.db, connection, source.start, source.end, source.records)).rejects.toThrow("removed");
    expect(fixture.upload).not.toHaveBeenCalled();
    const inactive = storageFixture(); inactive.deactivate();
    await expect(storeSunfireCollection(inactive.db, connection, source.start, source.end, source.records)).rejects.toThrow("active owner"); expect(inactive.upload).not.toHaveBeenCalled();
    const active = storageFixture();
    await expect(storeSunfireCollection(active.db, connection, source.start, source.end, [{ ...source.records[0], mbi: "partial" }])).rejects.toThrow();
    expect(active.upload).not.toHaveBeenCalled(); active.corrupt();
    await expect(storeSunfireCollection(active.db, connection, source.start, source.end, source.records)).rejects.toThrow("verification");
  });
});
