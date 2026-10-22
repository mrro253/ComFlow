import { expect, it } from "vitest";
import { sunfireReport } from "../sunfireReports";
it("keeps the submitted enrollment report distinct from the book of business", () => {
  expect(sunfireReport(undefined)).toMatchObject({ tab: "Performance", dated: true });
  expect(sunfireReport("book-of-business")).toMatchObject({ tab: "Book of Business", visual: "Table, Detail Report", dated: false });
});
it("rejects unsupported reports instead of exporting the wrong dataset", () => {
  expect(() => sunfireReport("other")).toThrow("Unsupported");
});
