import { sha256 } from "@/lib/carriers/digest";

/** Synthetic hash standing in for a PDF's content hash. */
export const SOURCE_HASH = sha256("synthetic offline PDF fixture");

/**
 * Builds statement text in the shape the Ultimate parser expects. All values
 * are synthetic: never put real member data in fixtures.
 */
export function statementText({
  rows = "UL000000101/01/2026 Agent 28.92$ RENEWAL",
  totals = "28.92$ RENEWAL Total",
  grand = "28.92",
  prefix = "",
  month = "September 2026",
}: {
  rows?: string;
  totals?: string;
  grand?: string;
  prefix?: string;
  month?: string;
} = {}): string {
  return `Ultimate Health Plans\nCommissions and Renewals Statement\n${month}\n${prefix}\n${rows}\n${totals}\nW123 Total${grand}$`;
}

/** One-row statement with an explicit writing agent / payee / layout prefix. */
export function writingAgentRowText(
  agent: string,
  payee: string,
  prefix = "MCC"
): string {
  return `Ultimate Health Plans\nCommissions and Renewals Statement\nSeptember 2026\nUL000000101/01/2026${agent}${prefix}W123W123${payee}28.92$ RENEWAL\n28.92$ RENEWAL Total\nW123 Total28.92$`;
}
