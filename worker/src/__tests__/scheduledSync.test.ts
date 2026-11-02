import { expect, it, vi } from "vitest";
import { queueScheduledSyncs, recoverInterruptedSync } from "../scheduledSync";
import type { Db } from "../db";

const connection = { id: "ed230000-0000-4000-8000-000000000123", agency_id: "synthetic-agency", user_id: "synthetic-owner", carrier: "Ultimate Health Plans", status: "active", last_sync_at: "2026-11-01T12:00:00Z", last_successful_sync_at: "2026-11-01T12:00:00Z", sync_requested_at: null, last_error: null };
function database(options: { active?: boolean; queued?: boolean; error?: boolean; recovering?: boolean; finished?: boolean } = {}) {
  const operations: { table: string; update?: unknown; filters: unknown[][] }[] = [];
  const db = { from(table: string) {
    const operation: typeof operations[number] = { table, filters: [] }; operations.push(operation);
    const result = () => ({ error: options.error ? { message: "Synthetic private database error" } : null,
      data: table === "users" ? options.active === false ? null : { id: connection.user_id } : operation.update ? options.queued === false ? [] : [{ id: connection.id }] : options.recovering ? { ...connection, last_sync_at: "2026-11-02T12:00:00Z", last_error: "Sync running. Opening portal.", ...(options.finished ? { last_successful_sync_at: "2026-11-02T12:00:01Z" } : {}) } : [connection] });
    const query = { select: vi.fn(() => query), order: vi.fn(() => query), range: vi.fn(() => query), update(value: unknown) { operation.update = value; return query; }, eq(...args: unknown[]) { operation.filters.push(["eq", ...args]); return query; }, is(...args: unknown[]) { operation.filters.push(["is", ...args]); return query; }, maybeSingle: async () => result(), then(resolve: (value: unknown) => unknown) { return Promise.resolve(result()).then(resolve); } };
    return query;
  } } as unknown as Db;
  return { db, operations };
}

it("queues only after checking active owner scope and guarding against a competing request", async () => {
  const { db, operations } = database();
  expect(await queueScheduledSyncs(db, new Date("2026-11-02T12:00:00Z"))).toBe(1);
  expect(operations.find(x => x.table === "users")?.filters).toEqual(expect.arrayContaining([["eq", "agency_id", connection.agency_id], ["eq", "active", true]]));
  const update = operations.find(x => x.update);
  expect(update?.update).toEqual({ sync_requested_at: "2026-11-02T12:00:00.000Z" });
  expect(update?.filters).toEqual(expect.arrayContaining([["eq", "last_sync_at", connection.last_sync_at], ["is", "sync_requested_at", null], ["eq", "status", "active"]]));
});
it("never queues an inactive owner or counts a lost compare-and-set as queued", async () => {
  const inactive = database({ active: false });
  expect(await queueScheduledSyncs(inactive.db, new Date("2026-11-02T12:00:00Z"))).toBe(0);
  expect(inactive.operations.some(x => x.update)).toBe(false);
  expect(await queueScheduledSyncs(database({ queued: false }).db, new Date("2026-11-02T12:00:00Z"))).toBe(0);
});
it("fails closed on an incomplete scan without leaking the database message", async () => {
  const { db, operations } = database({ error: true });
  await expect(queueScheduledSyncs(db)).rejects.toThrow("Could not read scheduled connections.");
  expect(operations.some(x => x.update)).toBe(false);
});
it("recovery records an interruption, never queues a login, and guards the observed run", async () => {
  const { db, operations } = database({ recovering: true });
  await recoverInterruptedSync(db, { connectionId: connection.id, startedAt: "2026-11-02T12:00:00Z" });
  const update = operations.find(x => x.update);
  expect(update?.update).toEqual({ status: "needs_attention", last_error: expect.stringContaining("Update interrupted.") });
  expect(update?.filters).toContainEqual(["eq", "last_sync_at", "2026-11-02T12:00:00Z"]);
  expect(update?.filters).toContainEqual(["eq", "last_error", "Sync running. Opening portal."]);
});
it("leaves a successfully completed run untouched after a restart", async () => {
  const { db, operations } = database({ recovering: true, finished: true });
  await recoverInterruptedSync(db, { connectionId: connection.id, startedAt: "2026-11-02T12:00:00Z" });
  expect(operations.some(x => x.update)).toBe(false);
});
