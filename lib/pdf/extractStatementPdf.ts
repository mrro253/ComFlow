import pdf from "pdf-parse/lib/pdf-parse.js";
import { assertPdfBytes, extractPdfText } from "@/lib/pdf/extractPdfText";
import { sha256 } from "@/lib/carriers/digest";
import { UHC_CARRIER, type UhcPage } from "@/lib/carriers/uhc/parseUhcStatement";

/** Preserve the rotated UHC table's cells, including blanks. Other carriers retain their extraction. */
export async function extractStatementPdf(bytes: Uint8Array, carrier: string) {
  if (carrier !== UHC_CARRIER) return extractPdfText(bytes);
  assertPdfBytes(bytes);
  const pages: UhcPage[] = [];
  await pdf(Buffer.from(bytes), { pagerender: async (page: {
    getTextContent(): Promise<{ items: { str: string; transform: number[] }[] }>;
  }) => {
    const { items } = await page.getTextContent();
    pages.push(items.filter((item) => item.str.trim()).map((item) => ({
      text: item.str.trim(), row: item.transform[4], column: item.transform[5],
    })));
    return "";
  } });
  return { text: JSON.stringify({ format: "uhc-rotated-v1", pages }), pages: pages.length, sha256: sha256(bytes) };
}
