import type { PreviewRow } from "@/lib/carriers/buildStatementPreview";
import { normalizeWritingAgentName } from "@/lib/carriers/classifyWritingAgent";

/** A writing-agent name on the statement that no teammate could be matched to. */
export interface UnmatchedAgent {
  /** As printed on the statement. */
  name: string;
  normalized: string;
  /** The writer's carrier agent number as printed, when the layout has one. */
  writingAgentId: string | null;
  /** "ambiguous": several teammates share the name; "no-match": nobody has it. */
  code: "no-match" | "ambiguous";
  rowCount: number;
  totalCents: number;
}

/**
 * Names the Owner should be asked about before importing: verified writing
 * agents on rows that will import, whom nobody could be matched to. Unverified
 * rows are left out (no name is trusted there).
 */
export function summarizeUnmatchedAgents(rows: readonly PreviewRow[]): UnmatchedAgent[] {
  const byName = new Map<string, UnmatchedAgent>();
  for (const row of rows) {
    const c = row.classification;
    if (row.disposition !== "new" || c.status !== "review") continue;
    if (c.code === "unverified" || !row.transaction.writingAgent) continue;

    const normalized = normalizeWritingAgentName(row.transaction.writingAgent);
    const entry = byName.get(normalized) ?? {
      name: row.transaction.writingAgent,
      normalized,
      writingAgentId: row.transaction.writingAgentId,
      code: c.code,
      rowCount: 0,
      totalCents: 0,
    };
    entry.rowCount++;
    entry.totalCents += row.transaction.amountCents;
    byName.set(normalized, entry);
  }
  return [...byName.values()].sort((a, b) => b.rowCount - a.rowCount || a.name.localeCompare(b.name));
}

function titleCase(word: string): string {
  return word
    .toLowerCase()
    .replace(/(^|[-' ])([a-z])/g, (_, sep: string, letter: string) => sep + letter.toUpperCase());
}

/**
 * Splits a printed writing-agent name into first and last name for pre-filling
 * the "create agent" form. Carriers print "LAST, FIRST"; a name without a comma
 * is read as "First Last". The Owner can edit both before saving.
 */
export function splitWritingAgentName(name: string): { firstName: string; lastName: string } {
  const cleaned = name.replace(/\s+/g, " ").trim();
  if (cleaned.includes(",")) {
    const [last, ...rest] = cleaned.split(",");
    return {
      firstName: titleCase(rest.join(" ").trim()),
      lastName: titleCase(last.trim()),
    };
  }
  const [first = "", ...rest] = cleaned.split(" ");
  return { firstName: titleCase(first), lastName: titleCase(rest.join(" ")) };
}
