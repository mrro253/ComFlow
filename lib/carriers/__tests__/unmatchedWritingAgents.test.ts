import { describe, expect, it } from "vitest";
import { buildStatementPreview } from "@/lib/carriers/buildStatementPreview";
import { writingAgentAliasesFor, type WritingAgentOwner } from "@/lib/carriers/classifyWritingAgent";
import {
  splitWritingAgentName,
  summarizeUnmatchedAgents,
} from "@/lib/carriers/unmatchedWritingAgents";
import { parseUltimateText } from "@/lib/carriers/ultimate/parseUltimateStatement";
import { SOURCE_HASH } from "@/lib/carriers/__fixtures__/ultimateText";

const CAREER: WritingAgentOwner = {
  userId: "user-career",
  agentType: "career",
  productionEntityId: "entity-agency",
  entityType: "agency",
};
const known = new Map<string, readonly WritingAgentOwner[]>(
  writingAgentAliasesFor("Pat", "Sample").map((a) => [a, [CAREER]])
);

const TEXT = [
  "Ultimate Health Plans",
  "Commissions and Renewals Statement",
  "September 2026",
  "UL000000101/01/2026SAMPLE, PATMCCW123W123PAYEE100.00$ COMMISSION",
  "UL000000201/01/2026STRANGER, ANNMCCW555W123PAYEE50.00$ COMMISSION",
  "UL000000301/01/2026STRANGER, ANNMCCW555W123PAYEE25.00$ COMMISSION",
  "UL000000401/01/2026NEWBIE, BOBMCCW777W123PAYEE(10.00)$ CHARGEBACK",
  "175.00$ COMMISSION Total",
  "(10.00)$ CHARGEBACK Total",
  "W123 Total165.00$",
].join("\n");

describe("summarizeUnmatchedAgents", () => {
  const preview = buildStatementPreview(parseUltimateText(TEXT, SOURCE_HASH), known, []);

  it("groups unmatched writing agents with counts, totals, and the printed carrier ID", () => {
    const summary = summarizeUnmatchedAgents(preview.rows);
    expect(summary).toEqual([
      expect.objectContaining({
        name: "STRANGER, ANN",
        writingAgentId: "W555",
        code: "no-match",
        rowCount: 2,
        totalCents: 7500,
      }),
      expect.objectContaining({ name: "NEWBIE, BOB", rowCount: 1, totalCents: -1000 }),
    ]);
  });

  it("leaves out matched agents and rows already imported", () => {
    const existing = parseUltimateText(TEXT, SOURCE_HASH).transactions.map((tx, i) => ({
      id: `tx-${i}`,
      transactionKey: tx.transactionKey,
      carrier: tx.carrier,
      statementMonth: tx.statementMonth,
      memberId: tx.memberId,
      type: tx.type,
      amountCents: tx.amountCents,
    }));
    const again = buildStatementPreview(parseUltimateText(TEXT, SOURCE_HASH), known, existing);
    expect(summarizeUnmatchedAgents(again.rows)).toEqual([]);
  });

  it("flags shared names as ambiguous", () => {
    const twins = new Map<string, readonly WritingAgentOwner[]>([
      ["SAMPLE PAT", [CAREER, { ...CAREER, userId: "twin" }]],
    ]);
    const shared = buildStatementPreview(parseUltimateText(TEXT, SOURCE_HASH), twins, []);
    const first = summarizeUnmatchedAgents(shared.rows).find((a) => a.name === "SAMPLE, PAT");
    expect(first?.code).toBe("ambiguous");
  });
});

describe("splitWritingAgentName", () => {
  it("reads the carrier's LAST, FIRST format", () => {
    expect(splitWritingAgentName("SAMPLE, PAT")).toEqual({ firstName: "Pat", lastName: "Sample" });
    expect(splitWritingAgentName("O'BRIEN-SMITH, MARY JO")).toEqual({
      firstName: "Mary Jo",
      lastName: "O'Brien-Smith",
    });
  });

  it("reads a name without a comma as First Last", () => {
    expect(splitWritingAgentName("pat  sample")).toEqual({ firstName: "Pat", lastName: "Sample" });
    expect(splitWritingAgentName("Cher")).toEqual({ firstName: "Cher", lastName: "" });
  });
});
