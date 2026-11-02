import type { Page } from "playwright";

/** One fresh-document retry for a SunFire SPA route that did not render its form. */
export async function loadEnrollmentDetailDocument(page: Page, target: string, freshDocument = false) {
  await page.goto(target, { waitUntil: "domcontentloaded" });
  if (freshDocument) await page.reload({ waitUntil: "domcontentloaded" });
  const code = page.getByText("Enrollment code", { exact: true });
  try { await code.waitFor({ state: "visible", timeout: 15000 }); }
  catch (error) {
    if (!(error instanceof Error) || error.name !== "TimeoutError") throw error;
    await page.reload({ waitUntil: "domcontentloaded" });
    await code.waitFor({ state: "visible", timeout: 30000 });
  }
}
