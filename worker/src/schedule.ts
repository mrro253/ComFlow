import type { ConnectionRow } from "./db.js";

const DAY = 24 * 60 * 60 * 1000;
const AUTOMATIC_CARRIERS = new Set(["Ultimate Health Plans", "Devoted Health", "SunFire"]);

/** Statement runs occur only on day one in the operator's configured timezone. */
export function scheduledConnectionDue(connection: ConnectionRow, now: Date, timeZone = process.env.SYNC_SCHEDULE_TIMEZONE ?? "America/New_York"): boolean {
  if (connection.status !== "active" || connection.sync_requested_at || !AUTOMATIC_CARRIERS.has(connection.carrier)) return false;
  if (!Number.isFinite(now.getTime())) return false;
  const previous = connection.last_sync_at ? Date.parse(connection.last_sync_at) : null;
  if (previous !== null && (!Number.isFinite(previous) || previous > now.getTime())) return false;
  // Enrollment collection is independent of monthly commission statement collection.
  if (connection.carrier === "SunFire") return previous === null || now.getTime() - previous >= DAY;
  const calendar = (date: Date) => {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
    const value = (type: string) => parts.find(part => part.type === type)?.value;
    return { month: `${value("year")}-${value("month")}`, day: value("day") };
  };
  const current = calendar(now);
  if (current.day !== "01") return false;
  return previous === null || calendar(new Date(previous)).month !== current.month;
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
