/** Read-only local format check. No database clients, uploads or imports are invoked. */
import { readFile, readdir, realpath } from "node:fs/promises";
import path from "node:path";
import { sha256 } from "../lib/carriers/digest";
import { extractPdfText } from "../lib/pdf/extractPdfText";
import { readDevotedWorkbook } from "../lib/workbooks/readDevotedWorkbook";
import { parseDevotedPair } from "../lib/carriers/devoted/parseDevotedPair";
async function main() {
  const directory = await realpath(process.argv[2] ?? "");
  const root = await realpath(process.cwd());
  if (directory === root || directory.startsWith(root + path.sep)) throw new Error("Private sources must be outside the repository");
  const results: { payDate: string; entries?: number; cents?: number; verified: boolean; stage?: string; reason?: string }[] = [];
  for (const filename of (await readdir(directory)).filter((f) => /^[a-f0-9]{64}\.json$/.test(f))) {
    let payDate = "unknown", stage = "manifest";
    try {
      const manifest = JSON.parse(await readFile(path.join(directory, filename), "utf8"));
      if (!/^\d{4}-\d{2}-\d{2}$/.test(manifest.payDate)) throw new Error("Invalid date");
      payDate = manifest.payDate;
      const read = async (source: { sha256: string; file: string }, extension: string) => {
        if (!/^[a-f0-9]{64}$/.test(source.sha256) || source.file !== `${source.sha256}.${extension}`) throw new Error("Invalid manifest source");
        const location = await realpath(path.join(directory, source.file));
        if (!location.startsWith(directory + path.sep)) throw new Error("Invalid source location");
        const bytes = await readFile(location);
        if (sha256(bytes) !== source.sha256) throw new Error("Source mismatch");
        return bytes;
      };
      const pdfBytes = await read(manifest.pdf, "pdf"), workbookBytes = await read(manifest.spreadsheet, "xlsx");
      stage = "workbook";
      const workbook = await readDevotedWorkbook(workbookBytes);
      stage = "pdf";
      const pdf = await extractPdfText(pdfBytes);
      if (pdf.pages !== 1) throw new Error("Unsupported PDF page count");
      stage = "reconciliation";
      const pair = parseDevotedPair({ ...workbook, pdfText: pdf.text, pdfHash: pdf.sha256, workbookHash: sha256(workbookBytes) });
      if (pair.payDate !== payDate) throw new Error("Manifest date mismatch");
      results.push({ payDate, verified: true, entries: pair.statement.transactions.length, cents: pair.statement.statementTotalCents });
    } catch (error) { results.push({ payDate, verified: false, stage, reason: stage === "reconciliation" && error instanceof Error ? error.message : "Source validation failed" }); }
  }
  console.log(JSON.stringify({ results: results.sort((a,b) => a.payDate.localeCompare(b.payDate)), verified: results.filter((r) => r.verified).length, entries: results.reduce((n,r) => n+(r.entries ?? 0),0), totalCents: results.reduce((n,r) => n+(r.cents ?? 0),0) }, null, 2));
  if (!results.length || results.some((r) => !r.verified)) process.exitCode = 1;
}
main().catch(() => { console.error("Private format check failed. No records were changed."); process.exitCode = 1; });
