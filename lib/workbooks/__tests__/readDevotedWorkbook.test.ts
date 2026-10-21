import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { readDevotedWorkbook, validateWorkbookArchive } from "../readDevotedWorkbook";
import { extractPdfText } from "@/lib/pdf/extractPdfText";
import { makeTextPdf } from "@/lib/pdf/__fixtures__/makeTextPdf";
import { syntheticPair } from "@/lib/carriers/devoted/__fixtures__/syntheticPair";
import { parseDevotedPair } from "@/lib/carriers/devoted/parseDevotedPair";
import { sha256 } from "@/lib/carriers/digest";
const fixture = () => readFileSync(new URL("../__fixtures__/devoted-synthetic.xlsx", import.meta.url));
describe("bounded Devoted workbook reader", () => {
  it("reads an actual OOXML archive and reconciles an actual synthetic PDF", async () => {
    const bytes = fixture(); const workbook = await readDevotedWorkbook(bytes);
    const pdf = await extractPdfText(makeTextPdf(syntheticPair().pdfText.split("\n")));
    expect(parseDevotedPair({ ...workbook, pdfHash: pdf.sha256, workbookHash: sha256(bytes), pdfText: pdf.text }).statement.statementTotalCents).toBe(2891);
  });
  it("rejects legacy XLS, empty, oversized, corrupted and truncated archives", () => {
    for (const bytes of [Buffer.from("legacy"), Buffer.alloc(0), Buffer.alloc(15*1024*1024+1), fixture().subarray(0,100)]) expect(() => validateWorkbookArchive(bytes)).toThrow();
    const corrupt = fixture(); corrupt[50] ^= 1; expect(() => validateWorkbookArchive(corrupt)).toThrow();
  });
  it.each(["formula", "numeric-id", "external", "expanded-limit"])("rejects %s workbook before reading", async (kind) => {
    const bytes = readFileSync(new URL(`../__fixtures__/devoted-${kind}.xlsx`, import.meta.url));
    await expect(readDevotedWorkbook(bytes)).rejects.toThrow();
  });
});
