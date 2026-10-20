import { parseMoneyToCents } from "@/lib/carriers/money";
import type { ParsedTransaction } from "@/lib/carriers/types";

export interface StatementTextItem { str: string; width: number; transform: number[] }
export interface StatementRowDetails {
  clientName: string;
  fields: { label: string; value: string }[];
  memberId: string;
  effectiveDate: string;
  writingAgent: string;
  amountCents: number;
  category: string;
}

/** Coordinate-based columns preserve names and blank cells lost by flattened PDF text. */
export function readUltimateDetailPage(items: StatementTextItem[]): StatementRowDetails[] {
  const start = items.findIndex((item) => item.str.trim() === "Last Name");
  if (start < 0) throw new Error("Unsupported statement detail layout");
  const headings = items.slice(start, start + 13);
  if (headings.length !== 13 || headings[1].str.trim() !== "First Name" ||
      headings[3].str.trim() !== "UL ID #" || headings[12].str.trim() !== "Notes") {
    throw new Error("Unsupported statement detail columns");
  }
  const centers = headings.map((item) => item.transform[4] + item.width / 2);
  if (centers.some((x, i) => !Number.isFinite(x) || (i > 0 && x <= centers[i - 1]))) {
    throw new Error("Ambiguous statement columns");
  }
  return items.filter((item) => /^UL\d{7}$/.test(item.str)).map((member) => {
    const cells: StatementTextItem[][] = headings.map(() => []);
    for (const item of items) {
      if (!item.str.trim() || Math.abs(item.transform[5] - member.transform[5]) > 0.9) continue;
      const center = item.transform[4] + item.width / 2;
      let column = 0;
      for (let i = 1; i < centers.length; i++) {
        if (Math.abs(center - centers[i]) < Math.abs(center - centers[column])) column = i;
      }
      cells[column].push(item);
    }
    const values = cells.map((cell) => cell.sort((a, b) => a.transform[4] - b.transform[4])
      .map((item) => item.str.trim()).join(" ").replace(/\s+/g, " ").trim());
    return {
      clientName: [values[1], values[0]].filter(Boolean).join(" "),
      fields: headings.map((item, i) => ({ label: item.str.trim(), value: values[i] })),
      memberId: values[3], effectiveDate: values[4], writingAgent: values[5],
      amountCents: parseMoneyToCents(values[9].replace(/\$/g, "").trim()),
      category: values[10],
    };
  });
}

/** Require all source rows to agree before attaching any client's details. */
export function verifiedUltimateDetails(
  transactions: ParsedTransaction[], details: StatementRowDetails[]
): Map<string, StatementRowDetails> {
  if (transactions.length !== details.length) throw new Error("Statement detail count differs");
  const result = new Map<string, StatementRowDetails>();
  transactions.forEach((tx, index) => {
    const detail = details[index];
    if (tx.memberId !== detail.memberId || tx.effectiveDate !== detail.effectiveDate ||
        tx.amountCents !== detail.amountCents || tx.type !== detail.category ||
        (tx.writingAgentVerified && tx.writingAgent !== detail.writingAgent)) {
      throw new Error("Statement detail identity differs");
    }
    if (result.has(tx.transactionKey)) throw new Error("Ambiguous statement detail key");
    result.set(tx.transactionKey, detail);
  });
  return result;
}