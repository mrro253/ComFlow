import { describe, expect, it } from "vitest";
import {
  normalizeFilename,
  planCorrection,
  type PriorStatement,
} from "@/lib/carriers/planCorrection";

const row = (memberId: string, amountCents: number, type = "COMMISSION") => ({
  carrier: "ultimate",
  statementMonth: "2026-09",
  memberId,
  type,
  amountCents,
});

const prior = (id: string, rows: ReturnType<typeof row>[], filename = "Sept.pdf"): PriorStatement => ({
  id,
  filename,
  transactions: rows.map((r, i) => ({ id: `${id}-${i}`, transactionKey: `${id}-${i}`, ...r })),
});

const base = [row("UL1", 10000), row("UL2", 20000), row("UL3", -5000, "CHARGEBACK"), row("UL4", 7500)];

describe("normalizeFilename", () => {
  it("ignores case and surrounding whitespace", () => {
    expect(normalizeFilename("  Sept.PDF ")).toBe("sept.pdf");
    expect(normalizeFilename(null)).toBe("");
    expect(normalizeFilename("   ")).toBe("");
  });
});

describe("planCorrection", () => {
  it("returns none when there is no earlier statement with that name", () => {
    expect(planCorrection(base, [])).toEqual({ kind: "none" });
  });

  it("calls identical payments under the same file name a duplicate", () => {
    const plan = planCorrection(base, [prior("old", [...base].reverse())]);
    expect(plan).toEqual({ kind: "duplicate", of: { id: "old", filename: "Sept.pdf" } });
  });

  it("ignores zero-dollar informational rows when comparing", () => {
    const plan = planCorrection([...base, row("UL9", 0)], [prior("old", base)]);
    expect(plan.kind).toBe("duplicate");
  });

  it("treats mostly-overlapping different payments as a corrected version", () => {
    const corrected = [...base.slice(0, 3), row("UL4", 9000)];
    const plan = planCorrection(corrected, [prior("old", base)]);
    expect(plan).toEqual({ kind: "supersede", replaces: [{ id: "old", filename: "Sept.pdf" }] });
  });

  it("treats a correction that only adds a row as a supersede", () => {
    const plan = planCorrection([...base, row("UL5", 1000)], [prior("old", base)]);
    expect(plan.kind).toBe("supersede");
  });

  it("does not treat unrelated payments under a generic file name as a correction", () => {
    const unrelated = [row("X1", 100), row("X2", 200), row("X3", 300), row("X4", 400)];
    expect(planCorrection(unrelated, [prior("old", base)])).toEqual({ kind: "none" });
  });

  it("counts repeated identical payments as separate rows", () => {
    const twice = [row("UL1", 10000), row("UL1", 10000)];
    expect(planCorrection(twice, [prior("old", [row("UL1", 10000)])]).kind).toBe("supersede");
    expect(planCorrection(twice, [prior("old", twice)]).kind).toBe("duplicate");
  });

  it("can replace more than one earlier statement", () => {
    const plan = planCorrection(base, [
      prior("old-a", [...base.slice(0, 3), row("UL4", 1)]),
      prior("old-b", [...base.slice(0, 3), row("UL4", 2)]),
    ]);
    expect(plan.kind).toBe("supersede");
    if (plan.kind === "supersede") expect(plan.replaces.map((r) => r.id)).toEqual(["old-a", "old-b"]);
  });
});
