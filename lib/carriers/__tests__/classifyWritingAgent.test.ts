import { describe, expect, it } from "vitest";
import {
  classifyWritingAgent,
  normalizeWritingAgentName,
  writingAgentAliasesFor,
  type WritingAgentOwner,
} from "@/lib/carriers/classifyWritingAgent";
import { parseUltimateText } from "@/lib/carriers/ultimate/parseUltimateStatement";
import { SOURCE_HASH, writingAgentRowText } from "@/lib/carriers/__fixtures__/ultimateText";

const OWNER_PERSONAL: WritingAgentOwner = {
  userId: "user-owner",
  agentType: "independent",
  productionEntityId: "entity-personal",
  entityType: "personal",
};

// Synthetic name pair; matches both printed orderings.
const aliases = new Map<string, readonly WritingAgentOwner[]>(
  writingAgentAliasesFor("Pat", "Sample").map((alias) => [alias, [OWNER_PERSONAL]])
);

function parsedRow(agent: string, payee: string, prefix = "MCC") {
  return parseUltimateText(writingAgentRowText(agent, payee, prefix), SOURCE_HASH).transactions[0];
}

describe("normalizeWritingAgentName", () => {
  it("upper-cases, drops commas, and collapses whitespace", () => {
    expect(normalizeWritingAgentName(" sample,  pat ")).toBe("SAMPLE PAT");
  });
});

describe("classifyWritingAgent", () => {
  it("assigns a verified writing agent even when another party is the payee", () => {
    const row = parsedRow("SAMPLE, PAT", "ANOTHER PAYEE");
    expect(row.writingAgent).toBe("SAMPLE, PAT");
    const result = classifyWritingAgent(row, aliases);
    expect(result.status).toBe("assigned");
    if (result.status === "assigned") {
      expect(result.userId).toBe("user-owner");
      expect(result.entityType).toBe("personal");
    }
  });

  it("does not assign a different writing agent just because the alias holder is the payee", () => {
    const row = parsedRow("OTHER, JANE", "SAMPLE, PAT");
    expect(row.writingAgent).toBe("OTHER, JANE");
    expect(classifyWritingAgent(row, aliases).status).toBe("review");
  });

  it("accepts both name orders and casing, but never fuzzy matches", () => {
    for (const name of ["Pat Sample", "SAMPLE, PAT", " sample,  pat "]) {
      expect(
        classifyWritingAgent({ writingAgent: name, writingAgentVerified: true }, aliases).status
      ).toBe("assigned");
    }
    for (const name of ["Pat Sample Jr", "Pat A Sample", "Pat Sample Agency", "Pat Samples"]) {
      expect(
        classifyWritingAgent({ writingAgent: name, writingAgentVerified: true }, aliases).status
      ).toBe("review");
    }
  });

  it("holds unverified or unsupported-layout rows for review", () => {
    expect(
      classifyWritingAgent({ writingAgent: "Pat Sample", writingAgentVerified: false }, aliases).status
    ).toBe("review");
    expect(classifyWritingAgent(parsedRow("SAMPLE, PAT", "SAMPLE, PAT", "UNKNOWN"), aliases).status).toBe(
      "review"
    );
  });

  it("never guesses between teammates who share a name", () => {
    const twinA: WritingAgentOwner = { ...OWNER_PERSONAL, userId: "twin-a", payeeId: "W1111" };
    const twinB: WritingAgentOwner = { ...OWNER_PERSONAL, userId: "twin-b", payeeId: "W2222" };
    const shared = new Map<string, readonly WritingAgentOwner[]>([["PAT SAMPLE", [twinA, twinB]]]);
    const row = { writingAgent: "Pat Sample", writingAgentVerified: true };

    const ambiguous = classifyWritingAgent({ ...row, writingAgentId: null }, shared);
    expect(ambiguous).toMatchObject({ status: "review", code: "ambiguous" });
    // An ID that matches nobody does not break the tie either.
    expect(classifyWritingAgent({ ...row, writingAgentId: "W9999" }, shared)).toMatchObject({
      status: "review",
      code: "ambiguous",
    });

    const byId = classifyWritingAgent({ ...row, writingAgentId: "W2222" }, shared);
    expect(byId).toMatchObject({ status: "assigned", userId: "twin-b" });
  });

  it("reports names nobody has as no-match", () => {
    expect(
      classifyWritingAgent({ writingAgent: "Nobody Here", writingAgentVerified: true }, aliases)
    ).toMatchObject({ status: "review", code: "no-match" });
  });

  it("parses multiline names without changing the transaction key", () => {
    const multiline = parsedRow("SAMPLE,\nPAT\n", "SAMPLE, PAT");
    expect(multiline.writingAgent).toBe("SAMPLE, PAT");
    expect(multiline.transactionKey).toBe(parsedRow("SAMPLE, PAT", "SAMPLE, PAT").transactionKey);
  });
});
