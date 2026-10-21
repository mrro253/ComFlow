import { DevotedValidationError } from "./errors";
import { sha256 } from "@/lib/carriers/digest";
import { parseMoneyToCents } from "@/lib/carriers/money";
import type { ParsedStatement } from "@/lib/carriers/types";
import type { WorkbookCells } from "@/lib/workbooks/readDevotedWorkbook";

export const DEVOTED = "Devoted Health";
export const DEVOTED_PARSER_VERSION = "devoted-pair-v1-single-renewal";
export const DEVOTED_COLUMNS = ["Statement Date", "Agent NPN", "Agent Name", "Member ID", "Member HICN", "Member First", "Member Last", "Member State", "Signature Date", "Effective Date", "Disenroll Date", "Contract", "PBP", "Prior Plan Type", "CMS Cycle Year", "Commission Type", "Period", "Base Amount", "Admin Amount", "Total Payment", "FMO", "Payment Notations"] as const;
const norm = (value: string) => value.replace(/[^a-z0-9]/gi, "").toUpperCase();
export function pairHash(pdfHash: string, workbookHash: string): string {
  if (![pdfHash, workbookHash].every((hash) => /^[a-f0-9]{64}$/.test(hash))) throw new DevotedValidationError("Invalid source fingerprint");
  return sha256(JSON.stringify(["devoted-pair-v1", pdfHash, workbookHash]));
}
export function devotedDate(value: string): string {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
  if (!m) throw new DevotedValidationError("Unsupported Devoted date");
  const iso = `${m[3]}-${m[1]}-${m[2]}`;
  const date = new Date(`${iso}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== iso) throw new DevotedValidationError("Invalid Devoted date");
  return iso;
}
export function devotedMoney(value: string): number {
  const raw = value.replace(/^\$/, "");
  // Workbook numeric cells can preserve "0" or "28.9"; reject exponent and extra precision.
  const normalized = /^-?\d+$/.test(raw) ? `${raw}.00` : /^-?\d+\.\d$/.test(raw) ? `${raw}0` : raw;
  return parseMoneyToCents(normalized);
}
export interface DevotedPair {
  statement: ParsedStatement;
  pairHash: string;
  workbookHash: string;
  payDate: string;
  payeeHash: string;
  periodStart: string;
  periodEnd: string;
  parserVersion: string;
  fields: { label: string; value: string }[];
}

/** Fail closed to the only verified layout: one monthly renewal detail row. */
export function parseDevotedPair(input: { pdfText: string; pdfHash: string; workbookHash: string; summary: WorkbookCells; detail: WorkbookCells }): DevotedPair {
  const { pdfText, pdfHash, workbookHash, summary, detail } = input;
  const pair = pairHash(pdfHash, workbookHash);
  const fail = (message: string): never => { throw new DevotedValidationError(message); };
  if (detail.length !== 2 || JSON.stringify(detail[0]) !== JSON.stringify(DEVOTED_COLUMNS)) fail("Unsupported Devoted detail layout: one verified monthly-renewal row is required");
  const row = detail[1];
  if (row.length > 22 || row.slice(0, 10).some((value) => !value) || !row[11] || !row[15] || !row[16] || !row[19]) fail("Devoted source fields are incomplete");
  const get = (index: number) => row[index] ?? "";
  if (get(15) !== "Renewal - Monthly") fail("Devoted commission category needs a reviewed mapping");
  const payDate = devotedDate(get(0)), effectiveDateIso = devotedDate(get(9));
  devotedDate(get(8));
  if (get(10)) devotedDate(get(10));
  const amount = devotedMoney(get(19));
  if (amount < 0) fail("Negative Devoted renewal needs a reviewed mapping");
  const base = devotedMoney(get(17)), admin = devotedMoney(get(18));
  if (!Number.isSafeInteger(base + admin) || base + admin !== amount) fail("Devoted component amounts do not reconcile");
  if (!/^[a-z0-9-]+$/i.test(get(3)) || !/^\d+$/.test(get(1))) fail("Devoted member/writer identifiers need review");
  const labels = ["Description", "Credits", "Debits", "Miscellaneous", "Bonus", "Sub Total", "Balance", "TOTAL"];
  if (summary.length !== 8 || summary.some((r, index) => r[0] !== labels[index])) fail("Unsupported Devoted summary layout");
  const money = (index: number) => devotedMoney(summary[index][2] ?? "");
  if (summary[1][1] !== "1" || summary[2][1] !== "0" || summary[3][1] !== "0" || money(1) !== amount || [2, 3, 4, 6].some((index) => money(index) !== 0) || money(5) !== amount || money(7) !== amount) fail("Workbook summary does not reconcile; adjustments require review");
  const compact = pdfText.replace(/\s+/g, "");
  const pdfMoney = (label: string, count: boolean) => {
    const match = new RegExp(`${label}${count ? "(\\d+)" : ""}\\$(-?[\\d,]+\\.\\d{2})`).exec(compact);
    if (!match) fail("Unsupported Devoted PDF summary");
    return { count: count ? Number(match![1]) : null, amount: devotedMoney(match![count ? 2 : 1]) };
  };
  if (!norm(pdfText).includes("COMMISSIONPAYMENTSTATEMENT") || !compact.includes("AgentMBIMemberEffectiveContractAmountPeriodTypeDisenrollCancel")) fail("Unsupported Devoted PDF layout");
  for (const label of ["Credits", "Debits", "MiscellaneousPayments", "TOTAL"]) {
    const hit = pdfMoney(label, true), expected = ["Credits", "TOTAL"].includes(label) ? amount : 0;
    if (hit.amount !== expected || hit.count !== (expected === amount && ["Credits", "TOTAL"].includes(label) ? 1 : 0)) fail("PDF summary does not reconcile with workbook");
  }
  if ((!compact.includes("BonusMiscellaneousPayments") && pdfMoney("Bonus", false).amount !== 0) || pdfMoney("BalanceAdjustment", false).amount !== 0) fail("PDF adjustments need review");
  if (summary[0][4] !== "Payee" || summary[0][5] !== "Payment Date" || devotedDate(summary[1][5] ?? "") !== payDate) fail("Workbook payee/date header needs review");
  const payee = summary[1][4] ?? "";
  if (!payee || !norm(pdfText).includes(norm(payee))) fail("PDF and workbook payee context do not match");
  const englishDate = new Date(`${payDate}T00:00:00Z`).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
  if (!norm(pdfText).includes(norm(englishDate))) fail("PDF and workbook pay dates do not match");
  const period = /Payment\s*Period[\s\S]*?(\d{2}\/\d{2}\/\d{4})\s*-\s*(\d{2}\/\d{2}\/\d{4})/.exec(pdfText);
  if (!period) fail("PDF payment period is missing");
  const periodStart = devotedDate(period![1]), periodEnd = devotedDate(period![2]);
  if (periodStart > periodEnd || periodEnd > payDate) fail("Invalid Devoted payment period");
  const pdfDetail = pdfText.slice(pdfText.search(/Agent\s*MBI\s*Member/));
  if ((pdfDetail.match(/\$[\d,]+\.\d{2}/g) ?? []).length !== 1) fail("Unsupported Devoted PDF detail count");
  const identity = norm(pdfDetail);
  // One-row support makes these identities unambiguous; never use this token check for multiple rows.
  const dateShort = `${get(9).slice(0, 2)}-${get(9).slice(3, 5)}-${get(9).slice(8)}`;
  if (![get(1), get(2), get(4), get(5), get(6), get(11), dateShort, get(16), "Renewal", "Monthly"].every((value) => value && identity.includes(norm(value))) || !pdfDetail.includes(`$${Math.floor(amount / 100)}.${String(amount % 100).padStart(2, "0")}`)) fail("PDF and workbook detail identities do not reconcile");
  const tx = {
    carrier: DEVOTED, statementMonth: payDate.slice(0, 7), memberId: get(3), effectiveDate: get(9), effectiveDateIso,
    type: "RENEWAL", amountCents: amount, writingAgent: get(2), writingAgentVerified: true,
    writingAgentId: null, sourceHash: pdfHash, sourceRow: 2, occurrence: 1,
    transactionKey: sha256(JSON.stringify(["devoted-row-v1", pair, row, 1])),
  };
  return {
    statement: { carrier: DEVOTED, statementMonth: tx.statementMonth, sourceHash: pdfHash, transactions: [tx], categoryTotalsCents: { RENEWAL: amount }, transactionTotalCents: amount, carriedBalanceCents: 0, statementTotalCents: amount },
    pairHash: pair, workbookHash, payDate, payeeHash: sha256(norm(payee)), periodStart, periodEnd, parserVersion: DEVOTED_PARSER_VERSION,
    fields: DEVOTED_COLUMNS.map((label, index) => ({ label, value: get(index) })),
  };
}
