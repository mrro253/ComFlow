import { buildSampleStatementLines } from "@/lib/carriers/sampleStatement";
import { parseUltimateText } from "@/lib/carriers/ultimate/parseUltimateStatement";
import { uhcFixture, uhcFixturePdf } from "./uhcStatement";
import { extractPdfText } from "@/lib/pdf/extractPdfText";
import { extractStatementPdf } from "@/lib/pdf/extractStatementPdf";
import { makeTextPdf } from "@/lib/pdf/__fixtures__/makeTextPdf";
import { readUhcStatement, UHC_CARRIER } from "@/lib/carriers/uhc/parseUhcStatement";
import { syntheticPair } from "@/lib/carriers/devoted/__fixtures__/syntheticPair";
import { parseDevotedPair, type DevotedPair } from "@/lib/carriers/devoted/parseDevotedPair";
import { sha256 } from "@/lib/carriers/digest";
import type { ParsedStatement } from "@/lib/carriers/types";
import { normalizeWritingAgentName, type WritingAgentIndex } from "@/lib/carriers/classifyWritingAgent";

export const IMPORT_TEST_AGENCY = "e7100000-0000-4000-8000-000000000100";
export const IMPORT_TEST_OWNER = "e7100000-0000-4000-8000-000000000001";
export const IMPORT_TEST_ENTITY = "e7100000-0000-4000-8000-000000000200";
export interface ImportRegressionVersion { statement: ParsedStatement; pair?: DevotedPair }
export interface ImportRegressionCase {
  carrier: string; original: ImportRegressionVersion; regenerated: ImportRegressionVersion; corrected: ImportRegressionVersion;
}
export function syntheticImportOwners(statement: ParsedStatement): WritingAgentIndex {
  return new Map(statement.transactions.map(tx => [normalizeWritingAgentName(tx.writingAgent!), [{
    userId: IMPORT_TEST_OWNER, agentType: "independent", productionEntityId: IMPORT_TEST_ENTITY, entityType: "personal",
  }]]));
}
export async function buildImportRegressionCases(): Promise<ImportRegressionCase[]> {
  const ultimate = async (corrected: boolean, regenerated = false) => {
    let lines = buildSampleStatementLines();
    if (corrected) lines = lines.map(line => line.replace("300.00$", "310.00$").replace("1,175.00$", "1,185.00$").replace("1,037.50$", "1,047.50$"));
    const bytes = Buffer.concat([makeTextPdf(lines), Buffer.from(regenerated ? "\n% synthetic regenerated PDF" : "")]);
    const pdf = await extractPdfText(bytes);
    return { statement: parseUltimateText(pdf.text, pdf.sha256) };
  };
  const uhc = async (corrected: boolean, regenerated = false) => {
    const pages = uhcFixture();
    if (corrected) for (const page of pages) for (const cell of page) {
      if (cell.row === 304 && cell.column === 1410) cell.text = "$55.67";
      if (cell.text === "$58.01") cell.text = "$68.01";
    }
    const bytes = Buffer.concat([uhcFixturePdf(pages), Buffer.from(regenerated ? "\n% synthetic regenerated PDF" : "")]);
    const pdf = await extractStatementPdf(bytes, UHC_CARRIER);
    return { statement: readUhcStatement(pdf.text, pdf.sha256).statement };
  };
  const devoted = async (corrected: boolean, regenerated = false) => {
    const input = syntheticPair();
    if (corrected) {
      for (const sheet of [input.detail, input.summary]) for (const row of sheet) for (let i = 0; i < row.length; i++) {
        if (typeof row[i] === "string") row[i] = row[i]!.replace(/28\.91/g, "38.91");
      }
      input.pdfText = input.pdfText.replace(/28\.91/g, "38.91");
    }
    const bytes = Buffer.concat([makeTextPdf(input.pdfText.split("\n")), Buffer.from(regenerated ? "\n% synthetic regenerated PDF" : "")]);
    const pdf = await extractPdfText(bytes);
    const pair = parseDevotedPair({ ...input, pdfText: pdf.text, pdfHash: pdf.sha256, workbookHash: sha256(JSON.stringify([input.detail, input.summary])) });
    return { statement: pair.statement, pair };
  };
  const result: ImportRegressionCase[] = [];
  for (const factory of [ultimate, uhc, devoted]) {
    const original = await factory(false);
    result.push({ carrier: original.statement.carrier, original, regenerated: await factory(false, true), corrected: await factory(true) });
  }
  return result;
}
