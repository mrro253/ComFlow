import { beforeAll, describe, expect, it } from "vitest";
import { buildImportRegressionCases, syntheticImportOwners, type ImportRegressionCase } from "./fixtures/importRegressionCases";
import { buildStatementPreview, toImportRows } from "../buildStatementPreview";
import { planCorrection } from "../planCorrection";
import { previewDevoted } from "../devoted/preview";
import { extractStatementPdf } from "@/lib/pdf/extractStatementPdf";

let cases: ImportRegressionCase[];
beforeAll(async () => { cases = await buildImportRegressionCases(); });
describe.each(["Ultimate Health Plans", "UnitedHealthcare", "Devoted Health"])("%s repeat and correction planning", carrier => {
  const source = () => cases.find(c => c.carrier === carrier)!;
  const stored = () => source().original.statement.transactions.map((tx, i) => ({ ...tx, id: `old-${i}` }));
  it("proposes no new entries when the exact source is submitted again", () => {
    const c = source(), owners = syntheticImportOwners(c.original.statement);
    if (c.original.pair) {
      const pair = c.original.pair;
      const plan = previewDevoted(pair, owners, [{ id: "old", pairHash: pair.pairHash, payDate: pair.payDate, payeeHash: pair.payeeHash }]);
      expect(plan.duplicate).toBe(true); expect(toImportRows(plan.preview)).toEqual([]);
    } else {
      const preview = buildStatementPreview(c.original.statement, owners, stored());
      expect(preview.counts["already-imported"]).toBe(stored().length); expect(toImportRows(preview)).toEqual([]);
    }
  });
  it("holds or recognizes a regenerated file with identical economics", () => {
    const c = source(), owners = syntheticImportOwners(c.original.statement);
    expect(c.regenerated.statement.sourceHash).not.toBe(c.original.statement.sourceHash);
    if (c.original.pair && c.regenerated.pair) {
      const pair = c.original.pair;
      const plan = previewDevoted(c.regenerated.pair, owners, [{ id: "old", pairHash: pair.pairHash, payDate: pair.payDate, payeeHash: pair.payeeHash }]);
      expect(plan.replaces).toEqual(["old"]); expect(plan.duplicate).toBe(false);
    } else {
      const correction = planCorrection(c.regenerated.statement.transactions, [{ id: "old", filename: "synthetic.pdf", transactions: stored() }]);
      expect(correction.kind).toBe("duplicate");
      expect(toImportRows(buildStatementPreview(c.regenerated.statement, owners, stored(), null, correction))).toEqual([]);
      expect(buildStatementPreview(c.regenerated.statement, owners, stored()).canImport).toBe(false);
    }
  });
  it("proposes a complete corrected version without modifying the original", () => {
    const c = source(), before = JSON.stringify(c.original), owners = syntheticImportOwners(c.corrected.statement);
    let preview;
    if (c.original.pair && c.corrected.pair) {
      const old = c.original.pair;
      const plan = previewDevoted(c.corrected.pair, owners, [{ id: "old", pairHash: old.pairHash, payDate: old.payDate, payeeHash: old.payeeHash }]);
      expect(plan.replaces).toEqual(["old"]); preview = plan.preview;
    } else {
      const correction = planCorrection(c.corrected.statement.transactions, [{ id: "old", filename: "synthetic.pdf", transactions: stored() }]);
      expect(correction.kind).toBe("supersede");
      preview = buildStatementPreview(c.corrected.statement, owners, [], null, correction);
    }
    expect(preview.canImport).toBe(true);
    expect(toImportRows(preview).reduce((sum, row) => sum + row.amount_cents, 0)).toBe(c.corrected.statement.transactionTotalCents);
    expect(c.corrected.statement.transactionTotalCents - c.original.statement.transactionTotalCents).toBe(1000);
    expect(JSON.stringify(c.original)).toBe(before);
  });
  it("rejects an absent or non-PDF source with a clear explanation", async () => {
    await expect(extractStatementPdf(new Uint8Array(), carrier)).rejects.toThrow("empty");
    await expect(extractStatementPdf(Buffer.from("synthetic non-PDF"), carrier)).rejects.toThrow("not a PDF");
  });
});
