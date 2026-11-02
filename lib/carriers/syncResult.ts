export type LoginHelp = "verification" | "sign_in_review";
export function loginHelpMessage(reason: LoginHelp): string {
  return reason === "verification"
    ? "Verification needed. Complete the carrier's request in the worker browser; sync continues when ready."
    : "Sign-in review needed. Check the worker browser for a login message; sync continues when ready.";
}

export interface SyncResult {
  version: 1;
  connectionId: string;
  carrier: string;
  startedAt: string;
  finishedAt: string;
  outcome: "completed" | "failed";
  counts: { found: number; downloaded: number; skipped: number; failed: number } | null;
}

/** Reject malformed or cross-connection operational metadata before display. */
export function readSyncResult(value: unknown, connectionId: string, carrier: string): SyncResult | null {
  if (!value || typeof value !== "object") return null;
  const s = value as SyncResult;
  if (s.version !== 1 || s.connectionId !== connectionId || s.carrier !== carrier || !["completed", "failed"].includes(s.outcome)) return null;
  if (typeof s.startedAt !== "string" || typeof s.finishedAt !== "string" || !Number.isFinite(Date.parse(s.startedAt)) || !Number.isFinite(Date.parse(s.finishedAt)) || Date.parse(s.finishedAt) < Date.parse(s.startedAt)) return null;
  if (s.counts !== null && (!s.counts || ![s.counts.found, s.counts.downloaded, s.counts.skipped, s.counts.failed].every((n) => Number.isSafeInteger(n) && n >= 0))) return null;
  if (s.outcome === "completed" && s.counts === null) return null;
  return { version: 1, connectionId, carrier, startedAt: s.startedAt, finishedAt: s.finishedAt, outcome: s.outcome,
    counts: s.counts ? { found: s.counts.found, downloaded: s.counts.downloaded, skipped: s.counts.skipped, failed: s.counts.failed } : null };
}
