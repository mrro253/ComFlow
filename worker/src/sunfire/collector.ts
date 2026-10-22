import type { BrowserContext, Page } from "playwright";
import { detailUrl, enrollmentWindows, rememberEnrollment, verifyEnrollment, type EnrollmentListRow, type CollectedEnrollment, EnrollmentReadError } from "./enrollment.js";

const mmdd = (iso: string) => `${iso.slice(5, 7)}/${iso.slice(8)}/${iso.slice(0, 4)}`;
const clean = (value: string) => value.trim().replace(/\s+/g, " ");
interface ReportSnapshot { count: number; rows: EnrollmentListRow[] }
async function reportSnapshot(page: Page): Promise<ReportSnapshot> {
  const text = await page.locator("body").innerText();
  const count = /\((\d+)\s+enrollments?\)/i.exec(text);
  if (!count) throw new EnrollmentReadError("Report count is unavailable.");
  const headers = (await page.getByRole("columnheader").allTextContents()).map(clean);
  const required = ["Enrollment Code", "First name", "Last name", "Carrier", "Status", "Date"];
  if (required.some((h) => headers.indexOf(h) < 0)) throw new EnrollmentReadError("Report layout needs review.");
  const cells = await page.locator("table tbody tr").evaluateAll((rows) => rows.map((row) => Array.from(row.querySelectorAll("td")).map((cell) => cell.textContent ?? "")));
  const rows = cells.filter((r) => r.length === headers.length).map((r) => {
    const get = (label: string) => clean(r[headers.indexOf(label)]);
    return { code: get("Enrollment Code"), firstName: get("First name"), lastName: get("Last name"),
      carrier: get("Carrier"), submittedDate: get("Date"), status: get("Status") };
  });
  if (rows.length !== Number(count[1]) || new Set(rows.map((r) => r.code)).size !== rows.length) throw new EnrollmentReadError("The report list is incomplete or ambiguous; pagination needs review.");
  return { count: rows.length, rows };
}
async function loadWindow(page: Page, portal: string, window: { start: string; end: string }) {
  const reporting = new URL(portal); reporting.hash = "/reporting";
  await page.goto(reporting.href);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Enrollments", exact: true }).click();
  await page.locator("#timeFrame").selectOption("custom");
  const dates = page.getByPlaceholder("mm/dd/yyyy", { exact: true });
  if (await dates.count() !== 2) throw new EnrollmentReadError("Report date controls need review.");
  await dates.nth(1).fill(mmdd(window.end)); await dates.nth(1).press("Tab");
  await dates.nth(0).fill(mmdd(window.start)); await dates.nth(0).press("Tab");
  if (await dates.nth(0).inputValue() !== mmdd(window.start) || await dates.nth(1).inputValue() !== mmdd(window.end)) throw new EnrollmentReadError("SunFire changed the requested report dates.");
  await page.getByRole("button", { name: "Run", exact: true }).click();
  // Await the UI-triggered read requests; any unsettled request fails closed.
  await page.waitForLoadState("networkidle", { timeout: 30000 });
  await page.waitForTimeout(1000);
  const first = await reportSnapshot(page);
  await page.waitForTimeout(1000);
  const second = await reportSnapshot(page);
  if (JSON.stringify(first) !== JSON.stringify(second) || second.rows.some((r) => r.submittedDate < window.start || r.submittedDate > window.end)) throw new EnrollmentReadError("The report has not settled to the requested date window.");
  return second;
}
async function readField(page: Page, label: string) {
  const locator = page.getByText(label, { exact: true });
  if (await locator.count() !== 1) throw new EnrollmentReadError("A required enrollment label is missing or ambiguous.");
  return locator.evaluate((e) => {
    const parent = e.parentElement;
    const input = parent?.querySelector("input");
    return input?.value ?? parent?.querySelector("i,p.summary-value")?.textContent?.trim() ?? "";
  });
}
export async function collectEnrollments(context: BrowserContext, page: Page, options: {
  portal: string; start: string; end: string;
  checkpoint(rows: CollectedEnrollment[], complete: boolean): Promise<void>;
  log(message: string): void;
  failure?(page: Page): Promise<void>;
}) {
  const discovered = new Map<string, EnrollmentListRow>();
  const collected: CollectedEnrollment[] = [];
  for (const window of enrollmentWindows(options.start, options.end)) {
    const snapshot = await loadWindow(page, options.portal, window);
    // Empty windows get an independent fresh read rather than trusting a previous empty screen.
    if (!snapshot.count && (await loadWindow(page, options.portal, window)).count !== 0) throw new EnrollmentReadError("An empty report changed during verification.");
    options.log(`Report window ${window.start} through ${window.end}: ${snapshot.count} enrollments.`);
    for (let i = 0; i < snapshot.rows.length; i++) {
      const row = snapshot.rows[i], prior = discovered.has(row.code);
      rememberEnrollment(discovered, row);
      if (prior) continue;
      options.log(`Opening enrollment ${collected.length + 1}: report action menu.`);
      await page.getByRole("table").getByRole("row").nth(i + 1).getByRole("cell").first().click();
      const link = page.getByRole("link", { name: "View Enrollment", exact: true });
      const href = await link.getAttribute("href");
      if (!href) throw new EnrollmentReadError("Enrollment detail link missing.");
      const target = detailUrl(href, options.portal, row.code);
      await page.getByRole("heading", { name: "Report Type", exact: true }).click();
      // One new document per enrollment avoids SunFire's same-route stale-form reuse.
      const detailPage = await context.newPage();
      try {
        options.log("Loading a fresh enrollment detail document.");
        await detailPage.goto(target, { waitUntil: "domcontentloaded" });
        await detailPage.getByText("Enrollment code", { exact: true }).waitFor({ state: "visible", timeout: 30000 });
        detailUrl(detailPage.url(), options.portal, row.code);
        options.log("Reading required enrollment fields.");
        const first = await readField(detailPage, "Enrollment code");
        const result = verifyEnrollment(row, { code: first,
          firstName: await readField(detailPage, "First name"), lastName: await readField(detailPage, "Last name"),
          mbi: await readField(detailPage, "Medicare number"), plan: await readField(detailPage, "Plan name"),
          proposedEffectiveDate: await readField(detailPage, "Proposed effective date") });
        if (first !== await readField(detailPage, "Enrollment code")) throw new EnrollmentReadError("Enrollment identity changed while reading.");
        collected.push(result);
        await options.checkpoint(collected, false);
        options.log(`Verified enrollment ${collected.length}; saved privately.`);
      } catch (error) {
        await options.failure?.(detailPage);
        throw error;
      } finally { await detailPage.close(); }
    }
  }
  await options.checkpoint(collected, true);
  return collected.length;
}
