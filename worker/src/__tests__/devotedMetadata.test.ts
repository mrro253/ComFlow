import { describe, expect, it } from "vitest";
import { assertDevotedFile, devotedFile, devotedPayDate } from "../carriers/devotedMetadata";
const base = "https://devoted-files-prod.s3.us-east-2.amazonaws.com/synthetic/statement.pdf";
describe("Devoted source identity and validation", () => {
  it("reads pay dates across years without depending on a statement filename", () => {
    expect(devotedPayDate("Sep 25, 2026")).toBe("2026-09-25");
    expect(devotedPayDate("Jan 2, 2025")).toBe("2025-01-02");
    expect(() => devotedPayDate("Feb 30, 2026")).toThrow("Invalid");
  });
  it("keeps signed tokens out of stable identity", () => {
    expect(devotedFile(base + "?token=one", "pdf").identity).toBe(devotedFile(base + "?token=two", "pdf").identity);
    expect(devotedFile(base.replace("statement", "correction"), "pdf").identity).not.toBe(devotedFile(base, "pdf").identity);
  });
  it.each([base.replace("https:", "http:"), base.replace("amazonaws.com", "amazonaws.com.invalid"), base.replace("https://", "https://user:pass@"), base.replace(".pdf", ".html"), "not-a-url"])("rejects unsafe or unexpected links %s", (url) => {
    expect(() => devotedFile(url, "pdf")).toThrow();
  });
  it("rejects login/error pages and mislabeled spreadsheet files", () => {
    expect(() => assertDevotedFile(Buffer.from("<html>Sign in</html>"), "pdf")).toThrow();
    expect(() => assertDevotedFile(Buffer.from("%PDF-test"), "xlsx")).toThrow();
    expect(() => assertDevotedFile(Buffer.alloc(0), "pdf")).toThrow();
    expect(() => assertDevotedFile(Buffer.alloc(15 * 1024 * 1024 + 1), "pdf")).toThrow();
    expect(() => assertDevotedFile(Buffer.from("%PDF-synthetic"), "pdf")).not.toThrow();
  });
});
