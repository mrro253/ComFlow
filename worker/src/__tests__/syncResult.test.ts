import { expect, it, vi } from "vitest";
import { saveSyncResult } from "../syncResult";
import type { Db, ConnectionRow } from "../db";
const connection = { id: "connection", agency_id: "agency", carrier: "Example" } as ConnectionRow;
it("writes only counts and timestamps under the connection's private operational path", async () => {
  const upload = vi.fn().mockResolvedValue({ error: null });
  const db = { storage: { from: () => ({ upload }) } } as unknown as Db;
  expect(await saveSyncResult(db, connection, new Date().toISOString(), { found: 9, downloaded: 1, skipped: 8, failed: 0 })).toBe(true);
  expect(upload.mock.calls[0][0]).toBe("agency/sync-results/connection/latest.json");
  const body = JSON.parse(upload.mock.calls[0][1].toString());
  expect(Object.keys(body).sort()).toEqual(["carrier", "connectionId", "counts", "finishedAt", "outcome", "startedAt", "version"]);
  expect(body.counts).toEqual({ found: 9, downloaded: 1, skipped: 8, failed: 0 });
});
it("summary storage failure cannot invalidate downloaded files", async () => {
  const db = { storage: { from: () => ({ upload: async () => { throw new Error("private storage error"); } }) } } as unknown as Db;
  expect(await saveSyncResult(db, connection, new Date().toISOString(), null)).toBe(false);
});
