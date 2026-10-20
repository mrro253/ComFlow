import pdf from "pdf-parse/lib/pdf-parse.js";
import { assertPdfBytes } from "@/lib/pdf/extractPdfText";
import { readUltimateDetailPage, type StatementRowDetails, type StatementTextItem } from "@/lib/carriers/ultimate/statementDetails";

interface DetailPage { getTextContent(): Promise<{ items: StatementTextItem[] }> }

export async function extractUltimateDetails(bytes: Uint8Array): Promise<StatementRowDetails[]> {
  assertPdfBytes(bytes);
  const pages: StatementRowDetails[][] = [];
  let failed = false;
  await pdf(Buffer.from(bytes), { pagerender: async (page: DetailPage) => {
    const { items } = await page.getTextContent();
    try { pages.push(readUltimateDetailPage(items)); } catch { failed = true; }
    return "";
  } });
  if (failed) throw new Error("Unsupported statement detail layout");
  return pages.flat();
}