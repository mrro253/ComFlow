/**
 * Carrier agent numbers (Ultimate prints them as "W" + digits) are compared
 * and stored upper-case with no spaces. Empty input means "not set".
 */
export function normalizePayeeId(raw: string | null | undefined): string | null {
  const cleaned = (raw ?? "").replace(/\s+/g, "").toUpperCase();
  return cleaned === "" ? null : cleaned;
}
