import type { ConnectionRow } from "./db.js";

const DAY = 24 * 60 * 60 * 1000;
const AUTOMATIC_CARRIERS = new Set(["Ultimate Health Plans", "Devoted Health", "SunFire"]);

/** Local rolling daily checks; never repeat credential failures or the paused UHC flow. */
export function scheduledConnectionDue(connection: ConnectionRow, now: Date): boolean {
  if (connection.status !== "active" || connection.sync_requested_at || !AUTOMATIC_CARRIERS.has(connection.carrier)) return false;
  if (!Number.isFinite(now.getTime())) return false;
  if (!connection.last_sync_at) return true;
  const previous = Date.parse(connection.last_sync_at);
  return Number.isFinite(previous) && now.getTime() - previous >= DAY;
}

export interface InterruptedRun { connectionId: string; startedAt: string }
export function needsInterruptionNotice(connection: ConnectionRow, run: InterruptedRun): boolean {
  if (connection.id !== run.connectionId || connection.status === "disabled" || connection.sync_requested_at) return false;
  const started = Date.parse(run.startedAt);
  if (!Number.isFinite(started)) return false;
  const claim = Date.parse(connection.last_sync_at ?? "");
  if (!Number.isFinite(claim) || claim < started) return false; // Crash before claiming leaves the request queued.
  const completed = Date.parse(connection.last_successful_sync_at ?? "");
  if (Number.isFinite(completed) && completed >= started) return false;
  return !connection.last_error || connection.last_error.startsWith("Sync running.") || /^(Verification needed\.|Sign-in review needed\.|Carrier verification)/.test(connection.last_error);
}
