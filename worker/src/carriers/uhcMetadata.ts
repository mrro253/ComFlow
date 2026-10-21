import { SafePortalError } from "./types.js";
export const UHC_STATEMENTS_URL = "https://www.uhcjarvis.com/content/jarvis/en/secure/commissions/statements.html";
const MONTHS = ["JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE", "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER"];
export const UHC_TEXT_HEADER = ["Party ID", "Agent Name", "Agent ID", "Statement Date", "Writing Agent ID", "Writing Agent Name", "Client Reference #", "Member Name", "MedicareID", "AARP Member ID / Exchange ID", "Policy Number", "Original Effective Date", "Plan Type", "Contract", "PBP", "Plan Code", "Member State", "Area ID", "Member County", "Commission Action", "Payment Period", "Prem Amount", "UAD Activity", "Commission", "Term Reason", "Reduction Indicator", "Comp Type", "Prior Plan", "Term Date", "Writing Agent NPN", "App Sign Date", ""];
export function uhcMonth(month: string) {
  if (!/^20\d{2}-(0[1-9]|1[0-2])$/.test(month)) throw new SafePortalError("Use a valid UnitedHealthcare statement month (YYYY-MM)");
  return { year: month.slice(0, 4), month: MONTHS[Number(month.slice(5)) - 1] };
}
export function assertUhcPage(value: string) {
  if (value !== UHC_STATEMENTS_URL) throw new SafePortalError("Open Jarvis Statements and More after signing in");
}
export function uhcDownloadName(filename: string, month: string, kind: "pdf" | "txt") {
  uhcMonth(month);
  const match = /^commission_statement_(\d+)_(20\d{2}-(?:0[1-9]|1[0-2]))-01\.(pdf|txt)$/i.exec(filename);
  if (!match || match[2] !== month || match[3].toLowerCase() !== kind) throw new SafePortalError("Downloaded UnitedHealthcare statement period or format does not match the request");
  return { partyId: match[1] };
}
/** Format validation only: text amounts/identities are not an approved import parser. */
export function assertUhcFile(bytes: Uint8Array, kind: "pdf" | "txt") {
  if (!bytes.length || bytes.length > 15 * 1024 * 1024) throw new SafePortalError("UnitedHealthcare source size is invalid (15 MiB maximum)");
  if (kind === "pdf") {
    if (Buffer.from(bytes.subarray(0, 5)).toString() !== "%PDF-") throw new SafePortalError("UnitedHealthcare PDF download is not a PDF");
  } else {
    let text: string;
    try { text = new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
    catch { throw new SafePortalError("UnitedHealthcare text download is not supported UTF-8"); }
    const header = text.split(/\r?\n/, 1)[0].split(",").map((cell) => cell.trim());
    if (JSON.stringify(header) !== JSON.stringify(UHC_TEXT_HEADER) || !text.includes("\n")) throw new SafePortalError("UnitedHealthcare text report header is unsupported");
  }
}
