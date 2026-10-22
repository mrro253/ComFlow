import { chromium } from "playwright";
import { access, mkdir, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import { collectEnrollments } from "./sunfire/collector.js";
import { enrollmentWindows, EnrollmentReadError, type CollectedEnrollment } from "./sunfire/enrollment.js";

async function exists(file: string) { try { await access(file); return true; } catch { return false; } }
async function main() {
  const portal = new URL(process.env.SUNFIRE_PORTAL_URL ?? "");
  if (portal.protocol !== "https:" || portal.hostname !== "www.sunfirematrix.com" || !portal.pathname.startsWith("/app/agent/") || portal.search || portal.hash || portal.username || portal.password) throw new Error("Invalid portal configuration.");
  const output = process.env.SUNFIRE_EXPORT_DIR ?? "";
  const start = process.env.SUNFIRE_REPORT_START ?? "", end = process.env.SUNFIRE_REPORT_END ?? "";
  enrollmentWindows(start, end);
  if (!path.isAbsolute(output)) throw new Error("An absolute private output directory is required.");
  for (let cursor = path.resolve(output);;) {
    if (await exists(path.join(cursor, ".git"))) throw new Error("Output must be outside Git checkouts.");
    const parent = path.dirname(cursor); if (parent === cursor) break; cursor = parent;
  }
  await mkdir(output, { recursive: true });
  const file = path.join(output, "enrollments.json");
  // Exclusive creation prevents replacing previous research artifacts.
  await writeFile(file, "{}", { flag: "wx" });
  const checkpoint = async (records: CollectedEnrollment[], complete: boolean) => {
    await writeFile(file, JSON.stringify({ version: 1, source: "SunFire Enrollments", start, end, complete,
      collectedAt: new Date().toISOString(), count: records.length, records }, null, 2));
  };
  await checkpoint([], false);
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({ viewport: { width: 1500, height: 900 }, acceptDownloads: false });
  const page = await context.newPage();
  await page.goto(portal.href);
  console.log("Sign in in the SunFire window. No credentials or verification codes are saved by this collector.");
  let retry = true;
  while (browser.isConnected()) {
    if (retry) {
      retry = false;
      try {
        await page.locator("#navLinkreporting").waitFor({ state: "attached", timeout: 900000 });
        const count = await collectEnrollments(context, page, { portal: portal.href, start, end, checkpoint, log: console.log });
        console.log(`Complete: ${count} enrollments verified. Nothing imported into ComFlow.`);
        break;
      } catch (error) {
        if (error instanceof EnrollmentReadError) console.log(error.message);
        console.log("Collection paused. The private output remains incomplete. Browser retained; create .retry-collector in the output folder to retry in this session.");
      }
    }
    const signal = path.join(output, ".retry-collector");
    if (await exists(signal)) { await unlink(signal); await checkpoint([], false); retry = true; }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  await browser.close();
}
main().catch(() => { console.error("Collector stopped. Check configuration or private output availability; no import was attempted."); process.exitCode = 1; });
