import { sha256 } from "@/lib/carriers/digest";
import { parseMoneyToCents } from "@/lib/carriers/money";
import type {
  ParsedStatement,
  ParsedTransaction,
  StatementParser,
} from "@/lib/carriers/types";

export const ULTIMATE_CARRIER = "Ultimate Health Plans";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const MONEY = "(?:\\(\\d[\\d,]*\\.\\d{2}\\)|-?\\d[\\d,]*\\.\\d{2}|-)";
const TYPES = "CHARGEBACK|COMMISSION|RENEWAL|INITIAL|ADJUSTMENT|TERM|BALANCE";

// Money immediately followed by "$ TYPE Total" is a category subtotal; the
// payee grand total is "W<number> Total <money>$".
const SUBTOTAL = new RegExp(`(${MONEY})\\s*\\$\\s*(${TYPES})\\s+Total\\b`, "g");
const GRAND_TOTAL = new RegExp(`W\\d+\\s+Total\\s*(${MONEY})\\s*\\$`, "g");
const AMOUNT_AND_TYPE = new RegExp(`(${MONEY})\\s*\\$\\s*(${TYPES})`, "g");
const BALANCE_ROW = new RegExp(`(${MONEY})\\s*\\$\\s*BALANCE(?!\\s+Total)`, "g");
const MEMBER_ID = /UL\d{7}/g;

function findStatementMonth(text: string): string {
  const pattern = new RegExp(`\\b(${MONTHS.join("|")})\\s+(20\\d{2})\\b`, "gi");
  const periods = new Set<string>();
  for (const match of text.matchAll(pattern)) {
    const monthIndex = MONTHS.findIndex(
      (month) => month.toLowerCase() === match[1].toLowerCase()
    );
    periods.add(`${match[2]}-${String(monthIndex + 1).padStart(2, "0")}`);
  }
  if (periods.size !== 1) throw new Error("Statement period is missing or ambiguous");
  return [...periods][0];
}

function toIsoDate(month: string, day: string, year: string, row: number): string {
  const check = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (
    check.getUTCMonth() !== Number(month) - 1 ||
    check.getUTCDate() !== Number(day)
  ) {
    throw new Error(`Row ${row}: invalid effective date`);
  }
  return `${year}-${month}-${day}`;
}

/**
 * The writing agent sits between the effective date and an "<ADV|MCC|PFS|BRP>W####
 * W####" code pair. Only these prefixes are verified against real Ultimate
 * layouts; anything else leaves the writing agent unverified so the row goes to
 * review instead of falling back to the payee (the payee never proves ownership).
 */
function extractWritingAgent(afterDate: string): string | null {
  const fields = afterDate.match(/^\s*([\s\S]*?)((?:ADV|MCC|PFS|BRP)W\d+)\s*(W\d+)/);
  const text = fields?.[1].replace(/\s+/g, " ").trim();
  return text && /^[A-Za-z][A-Za-z ,.'-]*$/.test(text) ? text : null;
}

export function parseUltimateText(text: string, sourceHash: string): ParsedStatement {
  if (!/^[a-f0-9]{64}$/.test(sourceHash)) {
    throw new Error("A PDF SHA-256 hash is required");
  }
  if (
    !/Ultimate Health Plans/i.test(text) ||
    !/Commissions and Renewals Statement/i.test(text)
  ) {
    throw new Error("Unrecognized carrier statement");
  }

  const statementMonth = findStatementMonth(text);

  const totals: Record<string, number> = {};
  for (const match of text.matchAll(SUBTOTAL)) {
    if (Object.hasOwn(totals, match[2])) {
      throw new Error("Repeated category subtotal requires review");
    }
    totals[match[2]] = parseMoneyToCents(match[1]);
  }

  const grandTotals = [...text.matchAll(GRAND_TOTAL)];
  if (grandTotals.length !== 1) throw new Error("Expected one payee statement total");
  const statementTotalCents = parseMoneyToCents(grandTotals[0][1]);

  const details = text.replace(SUBTOTAL, "").replace(GRAND_TOTAL, "");

  const balanceMatches = [...details.matchAll(BALANCE_ROW)];
  const carriedBalanceCents = balanceMatches.reduce(
    (sum, match) => sum + parseMoneyToCents(match[1]),
    0
  );
  if (balanceMatches.length && carriedBalanceCents !== totals.BALANCE) {
    throw new Error("Carried balance does not match its subtotal");
  }
  if (!balanceMatches.length && (totals.BALANCE ?? 0) !== 0) {
    throw new Error("Balance subtotal has no detail");
  }

  const members = [...details.matchAll(MEMBER_ID)];
  const transactions: ParsedTransaction[] = [];
  const occurrenceCounts = new Map<string, number>();

  members.forEach((member, index) => {
    const row = index + 1;
    const start = (member.index ?? 0) + member[0].length;
    const end = members[index + 1]?.index ?? details.length;
    const section = details.slice(start, end);

    const date = section.match(/^\s*(\d{2})\/(\d{2})\/(\d{4})/);
    if (!date) throw new Error(`Row ${row}: effective date missing`);
    const effectiveDateIso = toIsoDate(date[1], date[2], date[3], row);

    const amounts = [...section.matchAll(AMOUNT_AND_TYPE)];
    if (amounts.length !== 1 || amounts[0][2] === "BALANCE") {
      throw new Error(`Row ${row}: amount or transaction type ambiguous`);
    }
    const amountCents = parseMoneyToCents(amounts[0][1]);
    const type = amounts[0][2];
    if (type === "CHARGEBACK" && amountCents > 0) {
      throw new Error(`Row ${row}: positive chargeback requires review`);
    }

    const writingAgent = extractWritingAgent(section.slice(date[0].length));
    const effectiveDate = date[0].trim();
    const fingerprint = JSON.stringify([member[0], effectiveDate, type, amountCents]);
    const occurrence = (occurrenceCounts.get(fingerprint) ?? 0) + 1;
    occurrenceCounts.set(fingerprint, occurrence);

    transactions.push({
      carrier: ULTIMATE_CARRIER,
      statementMonth,
      memberId: member[0],
      effectiveDate,
      effectiveDateIso,
      type,
      amountCents,
      writingAgent,
      writingAgentVerified: writingAgent !== null,
      sourceHash,
      sourceRow: row,
      occurrence,
      transactionKey: sha256(
        JSON.stringify(["ultimate-v2", sourceHash, fingerprint, occurrence])
      ),
    });
  });

  const calculatedByType: Record<string, number> = {};
  for (const row of transactions) {
    calculatedByType[row.type] = (calculatedByType[row.type] ?? 0) + row.amountCents;
  }
  for (const type of new Set([...Object.keys(totals), ...Object.keys(calculatedByType)])) {
    if (type === "BALANCE") continue;
    if (!Object.hasOwn(totals, type) || (calculatedByType[type] ?? 0) !== totals[type]) {
      throw new Error(`${type} subtotal does not match extracted rows`);
    }
  }

  const transactionTotalCents = transactions.reduce((sum, row) => sum + row.amountCents, 0);
  if (transactionTotalCents + carriedBalanceCents !== statementTotalCents) {
    throw new Error("Statement total does not match transactions plus carried balance");
  }
  if (!transactions.length) throw new Error("No member transaction rows found");

  return {
    carrier: ULTIMATE_CARRIER,
    statementMonth,
    sourceHash,
    transactions,
    categoryTotalsCents: totals,
    transactionTotalCents,
    carriedBalanceCents,
    statementTotalCents,
  };
}

export const ultimateParser: StatementParser = {
  carrier: ULTIMATE_CARRIER,
  parse: parseUltimateText,
};
