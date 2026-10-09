import { describe, expect, it } from "vitest";
import { buildSampleStatementLines } from "@/lib/carriers/sampleStatement";
import { parseUltimateText } from "@/lib/carriers/ultimate/parseUltimateStatement";
import { SOURCE_HASH } from "@/lib/carriers/__fixtures__/ultimateText";

describe("sample statement", () => {
  it("reconciles and attributes every demo writing agent", () => {
    const parsed = parseUltimateText(buildSampleStatementLines().join("\n"), SOURCE_HASH);
    expect(parsed.statementMonth).toBe("2026-09");
    expect(parsed.transactions).toHaveLength(6);
    expect(parsed.statementTotalCents).toBe(103750);
    expect(parsed.transactions.every((tx) => tx.writingAgentVerified)).toBe(true);
    expect(parsed.transactions.map((tx) => tx.writingAgent)).toEqual([
      "AGENT, ALEX",
      "PATEL, PRIYA",
      "NGUYEN, CHRIS",
      "OWNER, JANE",
      "BROOKS, TAYLOR",
      "STRANGER, ANN",
    ]);
  });
});
