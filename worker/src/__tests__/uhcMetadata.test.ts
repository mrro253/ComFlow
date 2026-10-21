import { describe, expect, it } from "vitest";
import { assertUhcFile, assertUhcPage, uhcDownloadName, uhcMonth, UHC_STATEMENTS_URL, UHC_TEXT_HEADER } from "../carriers/uhcMetadata";
describe("UnitedHealthcare source metadata", () => {
  it("accepts only explicit supported month syntax", () => {
    expect(uhcMonth("2026-09")).toEqual({ year: "2026", month: "SEPTEMBER" });
    for (const value of ["2026-00", "2026-13", "2026-9", "2026-09-01", "2099-12-extra", "../2026-01"]) expect(() => uhcMonth(value)).toThrow();
  });
  it("checks exact portal and filename month/format context", () => {
    expect(() => assertUhcPage(UHC_STATEMENTS_URL)).not.toThrow();
    expect(() => assertUhcPage("https://identity.onehealthcareid.com/")).toThrow();
    expect(uhcDownloadName("commission_statement_999001_2026-09-01.pdf", "2026-09", "pdf")).toEqual({ partyId: "999001" });
    for (const name of ["commission_statement_999001_2026-08-01.pdf", "commission_statement_999001_2026-09-01.txt", "../commission_statement_999001_2026-09-01.pdf"]) expect(() => uhcDownloadName(name, "2026-09", "pdf")).toThrow();
  });
  it("validates content instead of trusting filename extensions", () => {
    expect(() => assertUhcFile(Buffer.from("%PDF-synthetic"), "pdf")).not.toThrow();
    expect(() => assertUhcFile(Buffer.from(UHC_TEXT_HEADER.join(",")+"\n"), "txt")).not.toThrow();
    for (const bytes of [Buffer.alloc(0), Buffer.alloc(15*1024*1024+1), Buffer.from("<html>Sign in</html>")]) expect(() => assertUhcFile(bytes,"pdf")).toThrow();
    expect(() => assertUhcFile(Buffer.from("<html>Sign in</html>"),"txt")).toThrow();
    expect(() => assertUhcFile(Buffer.from([0xff,0xfe,0]),"txt")).toThrow();
    expect(() => assertUhcFile(Buffer.from(UHC_TEXT_HEADER.join(",")),"txt")).toThrow();
  });
});
