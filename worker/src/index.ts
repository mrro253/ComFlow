import { claimConnection, createDb, listRequestedConnectionIds } from "./db.js";
import { syncConnection } from "./syncConnection.js";

/**
 * CommissionFlow carrier worker.
 *
 *   npm run once    process pending "Sync now" requests, then exit
 *   npm run start   keep polling every POLL_INTERVAL_SECONDS (default 30)
 *
 * Needs NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and
 * CREDENTIAL_ENCRYPTION_KEY (read from ../.env.local). See README "Carrier worker".
 * TODO: scheduled (nightly) syncs for every active connection, not just requested ones.
 */

const once = process.argv.includes("--once");
const intervalMs = Math.max(5, Number(process.env.POLL_INTERVAL_SECONDS ?? 30)) * 1000;

async function runOnce(): Promise<number> {
  const db = createDb();
  let processed = 0;
  for (const id of await listRequestedConnectionIds(db)) {
    const connection = await claimConnection(db, id);
    if (!connection) continue; // another worker took it
    console.log(`syncing ${connection.carrier} connection ${id.slice(0, 8)}`);
    await syncConnection(db, connection);
    processed++;
  }
  return processed;
}

async function main() {
  if (once) {
    const processed = await runOnce();
    console.log(`processed ${processed} sync request(s)`);
    return;
  }
  console.log(`worker polling every ${intervalMs / 1000}s (Ctrl+C to stop)`);
  for (;;) {
    try {
      await runOnce();
    } catch (error) {
      console.error(`poll failed: ${error instanceof Error ? error.message : "unknown error"}`);
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
