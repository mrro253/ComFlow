import type { BrowserContext, Page } from "playwright";
import { uniqueFieldValue } from "./fields.js";
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
async function loadWindow(page: Page, portal: string, window: { start: string; end: string }, stage: (value: string) => void = () => {}) {
  const reporting = new URL(portal); reporting.hash = "/reporting";
  stage("opening the enrollment report");
  await page.goto(reporting.href);
  await page.reload({ waitUntil: "domcontentloaded" });
  stage("selecting enrollment report dates");
  await page.getByRole("button", { name: "Enrollments", exact: true }).click();
  await page.locator("#timeFrame").selectOption("custom");
  const dates = page.getByPlaceholder("mm/dd/yyyy", { exact: true });
  if (await dates.count() !== 2) throw new EnrollmentReadError("Report date controls need review.");
  await dates.nth(1).fill(mmdd(window.end)); await dates.nth(1).press("Tab");
  await dates.nth(0).fill(mmdd(window.start)); await dates.nth(0).press("Tab");
  if (await dates.nth(0).inputValue() !== mmdd(window.start) || await dates.nth(1).inputValue() !== mmdd(window.end)) throw new EnrollmentReadError("SunFire changed the requested report dates.");
  await page.getByRole("button", { name: "Run", exact: true }).click();
  stage("waiting for the enrollment report to settle");
  // Await the UI-triggered read requests; any unsettled request fails closed.
  await page.waitForLoadState("networkidle", { timeout: 30000 });
  await page.waitForTimeout(1000);
  stage("checking enrollment report rows");
  const first = await reportSnapshot(page);
  await page.waitForTimeout(1000);
  const second = await reportSnapshot(page);
  if (JSON.stringify(first) !== JSON.stringify(second) || second.rows.some((r) => r.submittedDate < window.start || r.submittedDate > window.end)) throw new EnrollmentReadError("The report has not settled to the requested date window.");
  return second;
}
export async function readField(page: Page, label: string) {
  const locator = page.getByText(label, { exact: true });
  const values = await locator.evaluateAll((elements) => elements.map((e) => {
    const parent = e.parentElement;
    // Submitted applicant details use read-only display values. Provider input
    // controls reuse name labels and can contain a doctor's name; exclude them.
    return parent?.querySelector("i,p.summary-value")?.textContent?.trim() ?? "";
  }));
  // Provider sections can repeat applicant labels with empty inputs. Never choose
  // among different populated values, even when one happens to match the list.
  return uniqueFieldValue(values, label);
}
export async function collectEnrollments(_context: BrowserContext, page: Page, options: {
  portal: string; start: string; end: string;
  checkpoint(rows: CollectedEnrollment[], complete: boolean): Promise<void>;
  log(message: string): void;
  failure?(page: Page): Promise<void>;
}) {
  const discovered = new Map<string, EnrollmentListRow>();
  const collected: CollectedEnrollment[] = [];
  let stage = "starting enrollment collection";
  const setStage = (value: string) => { stage = value; };
  try {
  for (const window of enrollmentWindows(options.start, options.end)) {
    const snapshot = await loadWindow(page, options.portal, window, setStage);
    // Empty windows get an independent fresh read rather than trusting a previous empty screen.
    if (!snapshot.count && (await loadWindow(page, options.portal, window, setStage)).count !== 0) throw new EnrollmentReadError("An empty report changed during verification.");
    options.log(`Report window ${window.start} through ${window.end}: ${snapshot.count} enrollments.`);
    for (let i = 0; i < snapshot.rows.length; i++) {
      const row = snapshot.rows[i], prior = discovered.has(row.code);
      rememberEnrollment(discovered, row);
      if (prior) continue;
      options.log(`Opening enrollment ${collected.length + 1}: report action menu.`);
      stage = "opening an enrollment action menu";
      await page.getByRole("table").getByRole("row").nth(i + 1).getByRole("cell").first().click();
      const link = page.getByRole("link", { name: "View Enrollment", exact: true });
      const href = await link.getAttribute("href");
      if (!href) throw new EnrollmentReadError("Enrollment detail link missing.");
      const target = detailUrl(href, options.portal, row.code);
      await page.getByRole("heading", { name: "Report Type", exact: true }).click();
      // Preserve tab-scoped sign-in state; a full reload prevents stale SPA forms.
      const detailPage = page;
      let completed = false;
      try {
        options.log("Loading a fresh enrollment detail document.");
        stage = "loading an enrollment detail document";
        stage = "waiting for an enrollment detail form";
        const detailLoaderUrl = new URL(`./detailDocument.js?attempt=${Date.now()}`, import.meta.url);
        const { loadEnrollmentDetailDocument } = await import(detailLoaderUrl.href) as typeof import("./detailDocument.js");
        await loadEnrollmentDetailDocument(detailPage, target, true);
        detailUrl(detailPage.url(), options.portal, row.code);
        options.log("Reading required enrollment fields.");
        stage = "validating required enrollment fields";
        const first = await readField(detailPage, "Enrollment code");
        const result = verifyEnrollment(row, { code: first,
          firstName: await readField(detailPage, "First name"), lastName: await readField(detailPage, "Last name"),
          mbi: await readField(detailPage, "Medicare number"), plan: await readField(detailPage, "Plan name"),
          proposedEffectiveDate: await readField(detailPage, "Proposed effective date") });
        if (first !== await readField(detailPage, "Enrollment code")) throw new EnrollmentReadError("Enrollment identity changed while reading.");
        collected.push(result);
        await options.checkpoint(collected, false);
        completed = true;
        options.log(`Verified enrollment ${collected.length}; saved privately.`);
      } catch (error) {
        const current = new URL(detailPage.url());
        console.warn(JSON.stringify({ sunfireDetailDiagnostic: true,
          trustedOrigin: current.origin === new URL(options.portal).origin,
          detailRoute: current.hash.includes("/enrollment/"),
          codeLabelVisible: await detailPage.getByText("Enrollment code", { exact: true }).isVisible().catch(() => false),
          loginVisible: await detailPage.locator('input[type="password"]:visible').count().catch(() => 0) > 0 }));
        await options.failure?.(detailPage);
        throw error;
      } finally {
        if (completed) {
          const restored = await loadWindow(page, options.portal, window, setStage);
          if (JSON.stringify(restored) !== JSON.stringify(snapshot)) throw new EnrollmentReadError("The enrollment report changed while reading details; no complete collection was accepted.");
        }
      }
    }
  }
  await options.checkpoint(collected, true);
  return collected.length;
  } catch (error) {
    // Only controlled stage/error classes: never names, IDs, URLs or raw browser errors.
    console.warn(`SunFire stopped while ${stage} (${error instanceof EnrollmentReadError ? "validation" : error instanceof Error && error.name === "TimeoutError" ? "timeout" : "operation failed"}).`);
    if (error instanceof EnrollmentReadError) console.warn(error.message);
    throw error;
  }
}
