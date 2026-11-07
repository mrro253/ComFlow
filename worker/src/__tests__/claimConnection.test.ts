import { expect, it } from "vitest";
import { claimConnection, type Db } from "../db";
import { connectionSyncBusy } from "../../../lib/reporting/connectionStatus";

it("keeps the connection busy when the worker claims and clears its queued request", async () => {
  let saved: Record<string, unknown> = {};
  const query = {
    update: (value: Record<string, unknown>) => { saved = value; return query; },
    eq: () => query, not: () => query, neq: () => query, select: () => query,
    maybeSingle: async () => ({ data: saved, error: null }),
  };
  const db = { from: () => query } as unknown as Db;
  const claimed = await claimConnection(db, "synthetic-connection");
  expect(claimed?.sync_requested_at).toBeNull();
  expect(connectionSyncBusy({ status: claimed!.status, lastError: claimed!.last_error, syncRequestedAt: claimed!.sync_requested_at })).toBe(true);
});
