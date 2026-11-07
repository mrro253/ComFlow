import { processGhlImportJobs } from "./ghlImportJobs.js";
import { startVerificationServer } from "./verificationServer.js";
import { claimConnection, createDb, listRequestedConnectionIds, loadStatementOwner, markConnection } from "./db.js";
import { syncConnection } from "./syncConnection.js";
import { queueScheduledSyncs, recoverInterruptedSync } from "./scheduledSync.js";
import { openLocalRuntime } from "./localRuntime.js";
import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { join } from "node:path";

/**
 * CommissionFlow carrier worker.
 *
 *   npm run once    process pending "Sync now" requests, then exit
 *   npm run start   keep polling every POLL_INTERVAL_SECONDS (default 30)
 *
 * Needs NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and
 * CREDENTIAL_ENCRYPTION_KEY (read from ../.env.local). See README "Carrier worker".
 * Scheduling is opt-in and excludes UHC. Both commands share one local lock/journal.
 */

const once = process.argv.includes("--once");
const configuredInterval = Number(process.env.POLL_INTERVAL_SECONDS ?? 30);
const intervalMs = (Number.isFinite(configuredInterval) ? Math.max(5, configuredInterval) : 30) * 1000;
const scheduling = !once && process.env.SCHEDULED_SYNC_ENABLED === "true";
type Runtime = Awaited<ReturnType<typeof openLocalRuntime>>;

async function runOnce(runtime: Runtime): Promise<number> {
  const db = createDb();
  const interrupted = await runtime.read();
  if (interrupted) { await recoverInterruptedSync(db, interrupted); await runtime.write(null); }
  if (scheduling) await queueScheduledSyncs(db);
  let processed = 0;
  for (const id of await listRequestedConnectionIds(db)) {
    // Persist before the claim: a crash after clearing the DB request remains discoverable.
    await runtime.write({ connectionId: id, startedAt: new Date().toISOString() });
    const connection = await claimConnection(db, id);
    if (!connection) { await runtime.write(null); continue; }
    if (!await loadStatementOwner(db, connection.user_id)) {
      await markConnection(db, id, { ok: false, error: "Connection owner is unavailable or inactive. Contact your agency owner." });
      await runtime.write(null);
      continue;
    }
    console.log(`syncing ${connection.carrier} connection ${id.slice(0, 8)}`);
    await syncConnection(db, connection);
    await runtime.write(null);
    processed++;
  }
  await processGhlImportJobs(db);
  return processed;
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  if (!url) throw new Error("A database URL is required.");
  const endpoint = new URL(url);
  if (["localhost", "127.0.0.1", "[::1]"].includes(endpoint.hostname)) endpoint.hostname = "127.0.0.1";
  const scope = createHash("sha256").update(endpoint.origin).digest("hex").slice(0, 24);
  const runtime = await openLocalRuntime(join(process.env.LOCALAPPDATA ?? join(homedir(), ".local", "state"), "ComFlow", "worker", scope));
  const verification = await startVerificationServer();
  try {
  if (once) {
    const processed = await runOnce(runtime);
    console.log(`processed ${processed} sync request(s)`);
    return;
  }
  console.log(`worker polling every ${intervalMs / 1000}s; scheduled collection ${scheduling ? "enabled (statements: first of month; SunFire: daily; UHC excluded)" : "off"} (Ctrl+C to stop)`);
  for (;;) {
    try {
      await runOnce(runtime);
    } catch {
      console.error("Worker update paused after an error. Saved files and interruption state are preserved.");
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  } finally { verification?.close(); await runtime.close(); }
}

main().catch(() => {
  console.error("Worker could not complete. Check local runtime access and database configuration; no automatic retry was started.");
  process.exitCode = 1;
});
