import type { ConnectionRow, Db } from "./db.js";
import { needsInterruptionNotice, scheduledConnectionDue, type InterruptedRun } from "./schedule.js";

export async function queueScheduledSyncs(db: Db, now = new Date()): Promise<number> {
  const connections: ConnectionRow[] = [];
  for (let from = 0; ; from += 500) {
    if (from >= 100000) throw new Error("Scheduled connection scan exceeded its complete-read limit.");
    const { data, error } = await db.from("carrier_connections").select("*").eq("status", "active").is("sync_requested_at", null).order("id").range(from, from + 499);
    if (error || !data) throw new Error("Could not read scheduled connections.");
    connections.push(...data);
    if (data.length < 500) break;
  }
  let queued = 0;
  for (const connection of connections) {
    if (!scheduledConnectionDue(connection, now)) continue;
    const { data: owner, error: ownerError } = await db.from("users").select("id").eq("id", connection.user_id).eq("agency_id", connection.agency_id).eq("active", true).maybeSingle();
    if (ownerError) throw new Error("Could not verify an active connection owner.");
    if (!owner) continue;
    let query = db.from("carrier_connections").update({ sync_requested_at: now.toISOString() }).eq("id", connection.id).eq("status", "active").is("sync_requested_at", null);
    query = connection.last_sync_at ? query.eq("last_sync_at", connection.last_sync_at) : query.is("last_sync_at", null);
    const { data, error: queueError } = await query.select("id");
    if (queueError) throw new Error("Could not queue a scheduled connection.");
    queued += data?.length ?? 0;
  }
  return queued;
}

/** Recovery never replays credentials. Failed and verification-blocked runs need explicit resumption. */
export async function recoverInterruptedSync(db: Db, run: InterruptedRun): Promise<void> {
  const { data: connection, error } = await db.from("carrier_connections").select("*").eq("id", run.connectionId).maybeSingle();
  if (error) throw new Error("Could not inspect interrupted sync.");
  if (!connection || !needsInterruptionNotice(connection, run)) return;
  let query = db.from("carrier_connections").update({ status: "needs_attention", last_error: "Update interrupted. Saved files are preserved. Select Sync now to resume; any required sign-in will open in the worker browser." })
    .eq("id", connection.id).eq("last_sync_at", connection.last_sync_at!).eq("status", connection.status).is("sync_requested_at", null);
  query = connection.last_error === null ? query.is("last_error", null) : query.eq("last_error", connection.last_error);
  const { error: updateError } = await query;
  if (updateError) throw new Error("Could not record interrupted sync.");
}
