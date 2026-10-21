import { describe, expect, it } from "vitest";
import { statementCoverage } from "../statementCoverage";
const row = { carrier: "Synthetic Carrier", userId: null, statementMonth: "2026-01-01", status: "imported" };
describe("statement coverage", () => {
  it("keeps owners separate and uses presence, not payment assumptions", () => {
    const result = statementCoverage([row, { ...row, userId: "synthetic-agent", status: "pending" }], 2026);
    expect(result).toHaveLength(2);
    expect(result[0].months.slice(0, 2)).toEqual(["Imported", "None on file"]);
    expect(result[1].months[0]).toBe("Needs review");
  });
  it("ignores superseded copies and other years, while surfacing unresolved copies", () => {
    expect(statementCoverage([{ ...row, status: "superseded" }], 2026)).toEqual([]);
    expect(statementCoverage([row], 2025)[0].months.every((m) => m === "None on file")).toBe(true);
    expect(statementCoverage([row, { ...row, status: "failed" }], 2026)[0].months[0]).toBe("Needs review");
  });
});
