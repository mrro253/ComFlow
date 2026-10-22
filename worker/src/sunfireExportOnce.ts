import { sunfireReport } from "./sunfireReports.js";
import { chromium, type Page } from "playwright";
import { mkdir, access, unlink, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";

/** Download-only research utility. No database, credentials, imports or enrollment writes. */
async function main() {
  const portal = new URL(process.env.SUNFIRE_PORTAL_URL ?? "");
  if (portal.protocol !== "https:" || portal.hostname !== "www.sunfirematrix.com" || !portal.pathname.startsWith("/app/agent/") || portal.search || portal.username || portal.password) throw new Error("Invalid portal configuration");
  const configuredDir = process.env.SUNFIRE_EXPORT_DIR ?? "";
  if (!isAbsolute(configuredDir)) throw new Error("Private output folder must be absolute");
  const output = resolve(configuredDir);
  for (let path = output; ; path = dirname(path)) {
    if (existsSync(join(path, ".git"))) throw new Error("Exports must stay outside Git workspaces");
    if (dirname(path) === path) break;
  }
  const report = sunfireReport(process.env.SUNFIRE_REPORT_KIND);
  const start = process.env.SUNFIRE_REPORT_START ?? "", end = process.env.SUNFIRE_REPORT_END ?? "";
  if (report.dated && ![start, end].every((s) => /^\d{4}-\d{2}-\d{2}$/.test(s))) throw new Error("Explicit report dates are required");
  await mkdir(output, { recursive: true });
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({ acceptDownloads: true, viewport: { width: 1500, height: 900 } });
  const page = await context.newPage();
  await page.goto(portal.href);
  console.log("Sign in to SunFire in this worker window. Verification stays in that window.");
  const reporting = new URL(portal.href); reporting.hash = "/reporting";
  let stage = "waiting for sign-in";
  const retrySignal = join(output, ".retry-export");
  const saved = new Set<string>();
  async function exportPair(page: Page) {
    await page.waitForFunction(() => !!document.querySelector("#navLinkreporting"), null, { timeout: 30 * 60 * 1000 });
    stage = "opening reporting";
    await page.goto(reporting.href);
    stage = "opening selected report";
    await page.getByRole("button", { name: report.tab, exact: true }).click();
    const frame = page.frameLocator("iframe:not([title])");
    const visual = frame.getByRole("button", { name: report.visual, exact: true });
    stage = "waiting for detail table";
    await visual.waitFor({ timeout: 60000 });
    for (const suffix of ["first", "repeat"]) {
      if (saved.has(suffix)) continue;
      // Verify visible date controls instead of trusting defaults or an opaque dashboard URL.
      stage = "checking report dates";
      if (report.dated) {
        const startText = await frame.getByRole("heading", { name: /^Start Date:/ }).innerText();
        const endText = await frame.getByRole("heading", { name: /^End Date:/ }).innerText();
        const dateValue = (s: string) => new Date(`${s.slice(s.indexOf(":") + 1).trim()} UTC`).toISOString().slice(0, 10);
        if (dateValue(startText) !== start || dateValue(endText) !== end) throw new Error("Selected report dates differ from the approved test window");
      }
      if (!report.dated) {
        const filters = await frame.getByRole("heading", { level: 5 }).allTextContents();
        await writeFile(join(output, "sunfire-book-of-business-scope.json"), JSON.stringify({ report: report.kind, capturedAt: new Date().toISOString(), filters }, null, 2));
      }
      const prefix = report.dated ? `sunfire-enrollments-${start}_${end}` : "sunfire-book-of-business";
      const destination = join(output, `${prefix}-${suffix}.csv`);
      if (await access(destination).then(() => true).catch(() => false)) throw new Error("Research output already exists; choose another private output folder");
      stage = "opening export menu";
      await visual.scrollIntoViewIfNeeded(); await visual.hover();
      await visual.getByRole("button", { name: /Menu options/ }).click();
      stage = "capturing CSV download";
      const [download] = await Promise.all([page.waitForEvent("download", { timeout: 45000 }), frame.getByText("Export to CSV", { exact: true }).click()]);
      await download.saveAs(destination);
      if (await download.failure()) throw new Error("Export download failed");
      saved.add(suffix);
      console.log(`CSV ${suffix} download saved privately.`);
    }
  }
  for (;;) {
    try {
      await exportPair(page);
      console.log("Both exports completed. No ComFlow records were accessed or changed.");
      break;
    } catch {
      console.log(`Export paused at ${stage}. Browser retained; create .retry-export in the private output folder to retry.`);
      await page.screenshot({ path: join(output, "paused-worker.png") }).catch(() => undefined);
      let retry = false;
      while (!page.isClosed() && browser.isConnected()) {
        if (await access(retrySignal).then(() => true).catch(() => false)) { await unlink(retrySignal); retry = true; break; }
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
      if (!retry) break;
    }
  }
  await browser.close();
}
main().catch(() => { console.error("SunFire research could not start. Check the explicit portal, dates and private output folder."); process.exitCode = 1; });
