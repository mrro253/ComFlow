import { createHash } from "node:crypto";

/**
 * Error text that is safe to store and show to users: never includes URLs
 * (which may carry signed tokens), Playwright call logs, or selectors.
 */
export function safeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/https?:\/\/|Call log:|locator\(/i.test(message)) {
    return "Portal operation failed; check the login and statement availability";
  }
  return message.slice(0, 300);
}

/** Stable identity of a portal statement row: payee id + period + filename. */
export function statementIdentifier(row: { payeeId: string; period: string; filename: string }): string {
  return createHash("sha256")
    .update([row.payeeId.trim(), row.period.trim(), row.filename.trim()].join("|"))
    .digest("hex");
}

export function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/** Years to search: this year, plus last year early in the year (December statements). */
export function yearsToSync(now: Date = new Date()): number[] {
  const year = now.getFullYear();
  return now.getMonth() <= 1 ? [year, year - 1] : [year];
}
