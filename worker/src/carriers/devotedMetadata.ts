import { createHash } from "node:crypto";
import { SafePortalError } from "./types.js";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const FILE_HOST = "devoted-files-prod.s3.us-east-2.amazonaws.com";

export function devotedPayDate(text: string): string {
  const match = /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (\d{1,2}), (20\d{2})$/.exec(text.trim());
  if (!match) throw new SafePortalError("Unrecognized Devoted pay period");
  const month = MONTHS.indexOf(match[1]);
  const date = new Date(Date.UTC(Number(match[3]), month, Number(match[2])));
  if (date.getUTCMonth() !== month) throw new SafePortalError("Invalid Devoted pay period");
  return date.toISOString().slice(0, 10);
}

/** Signed query tokens are never part of a statement identity or a filename. */
export function devotedFile(url: string, format: "pdf" | "xlsx") {
  let parsed: URL;
  try { parsed = new URL(url); } catch { throw new SafePortalError("Invalid Devoted download link"); }
  if (parsed.protocol !== "https:" || parsed.hostname !== FILE_HOST || parsed.port || parsed.username || parsed.password ||
      !parsed.pathname.toLowerCase().endsWith(`.${format}`)) {
    throw new SafePortalError("Unexpected Devoted download destination");
  }
  return { url: parsed.href, identity: createHash("sha256").update(parsed.pathname).digest("hex") };
}

export function assertDevotedFile(bytes: Uint8Array, format: "pdf" | "xlsx"): void {
  const b = Buffer.from(bytes);
  if (b.length === 0 || b.length > 15 * 1024 * 1024) throw new SafePortalError("Devoted file is empty or exceeds the size limit");
  if (format === "pdf" ? b.subarray(0, 5).toString() !== "%PDF-" :
      b.subarray(0, 4).toString("hex") !== "504b0304" || !b.includes(Buffer.from("xl/workbook.xml"))) {
    throw new SafePortalError("Devoted returned an unexpected file format");
  }
}
