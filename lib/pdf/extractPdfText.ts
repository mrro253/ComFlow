import pdf from "pdf-parse/lib/pdf-parse.js";
import { sha256 } from "@/lib/carriers/digest";

/** Reject anything larger than this before parsing (statements are well under 1 MB). */
export const MAX_PDF_BYTES = 15 * 1024 * 1024;

export interface ExtractedPdf {
  text: string;
  pages: number;
  /** SHA-256 of the PDF bytes; the identity used to prevent duplicate imports. */
  sha256: string;
}

export function assertPdfBytes(bytes: Uint8Array): void {
  if (bytes.byteLength === 0) throw new Error("The file is empty");
  if (bytes.byteLength > MAX_PDF_BYTES) throw new Error("The PDF is too large (15 MB maximum)");
  const magic = Buffer.from(bytes.subarray(0, 5)).toString("latin1");
  if (magic !== "%PDF-") throw new Error("The file is not a PDF");
}

/**
 * Extracts text with pdf-parse 1.1.1 - the same version the Ultimate parser's
 * layout assumptions were verified against. Do not upgrade it without
 * re-verifying parsing against real statements.
 */
export async function extractPdfText(bytes: Uint8Array): Promise<ExtractedPdf> {
  assertPdfBytes(bytes);
  const buffer = Buffer.from(bytes);
  const parsed = await pdf(buffer);
  return { text: parsed.text, pages: parsed.numpages, sha256: sha256(buffer) };
}
