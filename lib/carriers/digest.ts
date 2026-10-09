import { createHash } from "node:crypto";

/** SHA-256 hex digest of a string or bytes. */
export function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

/**
 * JSON with object keys sorted, so equal data always serializes (and hashes)
 * identically regardless of property insertion order. `undefined` properties
 * are dropped, matching JSON.stringify.
 */
export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item === undefined ? null : item)).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, v]) => `${JSON.stringify(key)}:${stableStringify(v)}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value);
}

/** Order-independent digest of arbitrary JSON-like data. */
export function digest(value: unknown): string {
  return sha256(stableStringify(value));
}
