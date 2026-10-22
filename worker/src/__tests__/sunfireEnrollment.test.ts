import { describe, expect, it } from "vitest";
import { detailUrl, enrollmentWindows, rememberEnrollment, verifyEnrollment } from "../sunfire/enrollment";
import { uniqueFieldValue } from "../sunfire/fields";
import { readField } from "../sunfire/collector";
import type { Page } from "playwright";
const row = { code: "TEST123", firstName: "Example", lastName: "Person", carrier: "Example Carrier", submittedDate: "2026-01-20", status: "completed" };
const detail = { code: row.code, firstName: row.firstName, lastName: row.lastName, mbi: "1EG4TE5MK73", plan: "Example Plan", proposedEffectiveDate: "02/01/2026" };
describe("SunFire enrollment verification", () => {
  it("reads the submitted applicant value rather than a provider input with the same label", async () => {
    const applicant = { parentElement: { querySelector: (selector: string) => selector === "i,p.summary-value" ? { textContent: "Example" } : null } };
    const provider = { parentElement: { querySelector: (selector: string) => selector === "input" ? { value: "Doctor" } : null } };
    const page = { getByText: () => ({ evaluateAll: (read: (elements: Element[]) => string[]) => read([applicant, provider] as unknown as Element[]) }) } as unknown as Page;
    expect(await readField(page, "First name")).toBe("Example");
  });
  it("ignores empty repeated provider fields but rejects conflicting populated labels", () => {
    expect(uniqueFieldValue(["Example", "", "  "], "First name")).toBe("Example");
    expect(uniqueFieldValue(["Example", " Example "], "First name")).toBe("Example");
    expect(() => uniqueFieldValue(["Example", "Different"], "First name")).toThrow();
    expect(() => uniqueFieldValue(["", " "], "First name")).toThrow();
  });
  it("splits ranges into contiguous calendar months including leap days", () => {
    expect(enrollmentWindows("2024-01-20", "2024-03-03")).toEqual([{ start: "2024-01-20", end: "2024-01-31" }, { start: "2024-02-01", end: "2024-02-29" }, { start: "2024-03-01", end: "2024-03-03" }]);
  });
  it("rejects impossible or reversed dates", () => {
    expect(() => enrollmentWindows("2026-02-30", "2026-03-01")).toThrow();
    expect(() => enrollmentWindows("2026-03-01", "2026-01-01")).toThrow();
  });
  it("preserves a proposed date without confirming coverage", () => {
    expect(verifyEnrollment(row, detail)).toMatchObject({ proposedEffectiveDate: "2026-02-01", coverageConfirmed: false, identityVerified: true });
  });
  it.each([{ code: "STALE" }, { firstName: "Different" }, { lastName: "Different" }, { mbi: "***MK73" }, { mbi: "12345" }, { plan: "" }, { proposedEffectiveDate: "02/30/2026" }])("rejects stale or incomplete detail %j", (change) => {
    expect(() => verifyEnrollment(row, { ...detail, ...change })).toThrow();
  });
  it("requires the detail URL to identify the listed enrollment in the same agency", () => {
    const portal = "https://www.sunfirematrix.com/app/agent/example/";
    const suffix = `#/enrollment/SF_${encodeURIComponent(Buffer.from(row.code).toString("base64"))}/view?source=enrollment-reporting`;
    expect(detailUrl(portal + suffix, portal, row.code)).toBe(portal + suffix);
    expect(() => detailUrl(portal + suffix, portal, "OTHER")).toThrow();
    expect(() => detailUrl("https://example.com/" + suffix, portal, row.code)).toThrow();
    expect(() => detailUrl(portal.replace("example", "other") + suffix, portal, row.code)).toThrow();
  });
  it("deduplicates identical codes and rejects conflicting list identities", () => {
    const seen = new Map(); rememberEnrollment(seen, row); rememberEnrollment(seen, { ...row });
    expect(seen.size).toBe(1);
    expect(() => rememberEnrollment(seen, { ...row, lastName: "Changed" })).toThrow();
  });
});
