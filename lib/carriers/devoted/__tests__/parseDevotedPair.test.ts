import { describe, expect, it } from "vitest";
import { parseDevotedPair, pairHash, devotedMoney, devotedDate } from "../parseDevotedPair";
import { previewDevoted } from "../preview";
import { syntheticPair } from "../__fixtures__/syntheticPair";

describe("Devoted paired sources", () => {
  it("reconciles both sources, keeps all 22 fields and never substitutes MBI for member ID", () => {
    const pair = parseDevotedPair(syntheticPair());
    expect(pair.statement.transactions[0]).toMatchObject({ memberId: "SYNTH-M001", amountCents: 2891, type: "RENEWAL", writingAgentId: null, writingAgentVerified: true });
    expect(pair.fields).toHaveLength(22);
    expect(pair.payDate).toBe("2026-09-25");
    expect(pair.periodStart).toBe("2026-09-05");
  });
  it.each(["1.001", "1e3", "NaN", "90071992547410.00"])("rejects invalid or imprecise money %s", (money) => expect(() => devotedMoney(money)).toThrow());
  it("handles exact decimals without rounding and rejects invalid dates", () => {
    expect(devotedMoney("28.9")).toBe(2890); expect(devotedMoney("0")).toBe(0); expect(devotedMoney("(1.25)")).toBe(-125);
    expect(() => devotedDate("02/29/2026")).toThrow();
  });
  it.each([0, 1, 3, 4, 5, 6, 9, 11, 15, 19])("rejects missing critical source field %s", (index) => {
    const f = syntheticPair(); f.detail[1][index] = null;
    expect(() => parseDevotedPair(f)).toThrow();
  });
  it.each(["Credits 1 $28.91", "TOTAL 1 $28.91", "SYNTH-MBI001", "Sep 25, 2026", "999000001", "01-01-24"])("rejects mismatched PDF evidence %s", (text) => {
    const f = syntheticPair(); f.pdfText = f.pdfText.replace(text, "MISMATCH");
    expect(() => parseDevotedPair(f)).toThrow();
  });
  it("blocks unknown categories, unsupported multi-row layouts and nonzero adjustments", () => {
    let f = syntheticPair(); f.detail[1][15] = "First Year"; expect(() => parseDevotedPair(f)).toThrow("category");
    f = syntheticPair(); f.detail.push([...f.detail[1]]); expect(() => parseDevotedPair(f)).toThrow("layout");
    f = syntheticPair(); f.summary[6][2] = "$1.00"; expect(() => parseDevotedPair(f)).toThrow("reconcile");
  });
  it("accepts an observed blank PDF bonus only when the workbook confirms zero", () => {
    const f = syntheticPair(); f.pdfText = f.pdfText.replace("Bonus $0.00", "Bonus");
    expect(parseDevotedPair(f).statement.statementTotalCents).toBe(2891);
    f.summary[4][2] = "$1.00"; expect(() => parseDevotedPair(f)).toThrow();
  });
  it("keeps a zero-dollar supported event informational", () => {
    const f = syntheticPair(); f.pdfText = f.pdfText.replaceAll("$28.91", "$0.00");
    f.detail[1][17] = "0"; f.detail[1][19] = "0";
    for (const row of f.summary.slice(1)) row[2] = "$0.00";
    const p = previewDevoted(parseDevotedPair(f), new Map(), []);
    expect(p.preview.counts.informational).toBe(1); expect(p.preview.newTotalCents).toBe(0);
  });
  it("rejects extra PDF detail amounts even if the first row matches", () => {
    const f = syntheticPair(); f.pdfText += "\nSYNTHETIC EXTRA $1.00";
    expect(() => parseDevotedPair(f)).toThrow("detail count");
  });
  it("distinguishes workbook-only revisions, separate pay dates and identical pairs", () => {
    const f = syntheticPair(), a = parseDevotedPair(f);
    const prior = [{ id: "synthetic-old", pairHash: a.pairHash, payDate: a.payDate, payeeHash: a.payeeHash }];
    expect(previewDevoted(a, new Map(), prior).duplicate).toBe(true);
    const revision = parseDevotedPair({ ...f, workbookHash: "c".repeat(64) });
    expect(previewDevoted(revision, new Map(), prior).replaces).toEqual(["synthetic-old"]);
    expect(previewDevoted({ ...revision, payDate: "2026-09-30" }, new Map(), prior).replaces).toEqual([]);
    expect(a.statement.transactions[0].transactionKey).not.toBe(revision.statement.transactions[0].transactionKey);
    expect(pairHash(f.pdfHash, f.workbookHash)).toBe(a.pairHash);
  });
  it("does not use a payee name to infer a writer and holds ambiguous revision context", () => {
    const a = parseDevotedPair(syntheticPair());
    const prior = ["one", "two"].map((id) => ({ id, pairHash: "f".repeat(64), payDate: a.payDate, payeeHash: a.payeeHash }));
    const p = previewDevoted(a, new Map(), prior);
    expect(p.assignments[0].status).toBe("review"); expect(p.blockers).toHaveLength(1);
  });
});
