import type { ConnectionRow, Db } from "./db.js";
import type { PullSummary } from "./carriers/types.js";
import type { SyncResult } from "../../lib/carriers/syncResult.js";

/** Operational metadata only. No filenames, source rows, credentials, or raw errors. */
export async function saveSyncResult(db: Db, connection: ConnectionRow, startedAt: string, counts: PullSummary | null): Promise<boolean> {
  const result: SyncResult = { version: 1, connectionId: connection.id, carrier: connection.carrier,
    startedAt, finishedAt: new Date().toISOString(), outcome: counts ? "completed" : "failed",
    counts: counts ? { found: counts.found, downloaded: counts.downloaded, skipped: counts.skipped, failed: counts.failed } : null };
  try {
    const { error } = await db.storage.from("statements").upload(
      `${connection.agency_id}/sync-results/${connection.id}/latest.json`,
      Buffer.from(JSON.stringify(result)), { contentType: "application/json", upsert: true });
    return !error;
  } catch { return false; }
}
