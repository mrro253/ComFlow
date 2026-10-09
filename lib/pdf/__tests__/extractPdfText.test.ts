import { describe, expect, it } from "vitest";
import { sha256 } from "@/lib/carriers/digest";
import { parseUltimateText } from "@/lib/carriers/ultimate/parseUltimateStatement";
import { statementText } from "@/lib/carriers/__fixtures__/ultimateText";
import { assertPdfBytes, extractPdfText, MAX_PDF_BYTES } from "@/lib/pdf/extractPdfText";
import { makeTextPdf } from "@/lib/pdf/__fixtures__/makeTextPdf";

describe("extractPdfText", () => {
  it("extracts text and hashes the exact bytes", async () => {
    const bytes = makeTextPdf(["Hello synthetic statement", "Second line"]);
    const result = await extractPdfText(bytes);
    expect(result.pages).toBe(1);
    expect(result.text).toContain("Hello synthetic statement");
    expect(result.text).toContain("Second line");
    expect(result.sha256).toBe(sha256(bytes));
  });

  it("produces text the Ultimate parser can reconcile (real pdf-parse path)", async () => {
    const lines = statementText({
      rows:
        "UL000000101/01/2026 Agent 100.00$ COMMISSIONMAPD\n" +
        "UL000000201/01/2026 Agent (20.00)$ CHARGEBACKMAPD",
      totals: "100.00$ COMMISSION Total\n(20.00)$ CHARGEBACK Total",
      grand: "80.00",
    }).split("\n");
    const { text, sha256: hash } = await extractPdfText(makeTextPdf(lines));
    const parsed = parseUltimateText(text, hash);
    expect(parsed.transactions).toHaveLength(2);
    expect(parsed.statementTotalCents).toBe(8000);
    expect(parsed.transactions[1].amountCents).toBe(-2000);
  });
});

describe("assertPdfBytes", () => {
  it("rejects empty, non-PDF, and oversized files", () => {
    expect(() => assertPdfBytes(new Uint8Array())).toThrow(/empty/);
    expect(() => assertPdfBytes(Buffer.from("not a pdf at all"))).toThrow(/not a PDF/);
    const huge = Buffer.alloc(MAX_PDF_BYTES + 1);
    huge.write("%PDF-");
    expect(() => assertPdfBytes(huge)).toThrow(/too large/);
  });

  it("accepts PDF bytes", () => {
    expect(() => assertPdfBytes(makeTextPdf(["x"]))).not.toThrow();
  });
});
