import { mkdir, realpath } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { SafePortalError } from "./carriers/types.js";
import { UHC_STATEMENTS_URL, uhcMonth } from "./carriers/uhcMetadata.js";

let stage = "setup";
async function main() {
  const input = process.argv.slice(2), resume = input.includes("--resume");
  const args = input.filter((arg) => arg !== "--resume"), values = new Map<string, string>();
  if (args.length !== 4 || input.filter((arg) => arg === "--resume").length > 1) throw new Error("Provide --month YYYY-MM or --year YYYY, plus absolute --output; optional --resume applies to year mode only");
  for (let i = 0; i < args.length; i += 2) {
    if (!["--month", "--year", "--output"].includes(args[i]) || values.has(args[i])) throw new Error("Invalid arguments");
    values.set(args[i], args[i + 1]);
  }
  const month = values.get("--month") ?? "", output = values.get("--output") ?? "";
  const year = values.get("--year");
  if (values.has("--month") === values.has("--year") || !values.has("--output")) throw new Error("Choose one scope");
  if (year !== undefined) { if (!/^20\d{2}$/.test(year)) throw new Error("Invalid year"); }
  else { uhcMonth(month); if (resume) throw new Error("Resume requires year mode"); }
  if (!path.isAbsolute(output)) throw new Error("Use an absolute private output directory");
  const root = await realpath(fileURLToPath(new URL("../..", import.meta.url)));
  await mkdir(output, { recursive: true });
  const actual = await realpath(output), relative = path.relative(root, actual);
  if (relative === "" || (!relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))) throw new Error("Keep UnitedHealthcare sources outside Git");
  const browser = await chromium.launch({ headless: false });
  try {
    const context = await browser.newContext({ acceptDownloads: true, viewport: { width: 1440, height: 1000 } });
    const page = await context.newPage();
    stage = "opening Jarvis";
    await page.goto(UHC_STATEMENTS_URL);
    stage = "waiting for sign-in and the Commission Statements page";
    console.log("Sign in to Jarvis and complete verification in this worker browser. Open Commissions > Statements and More. No credentials or sessions are saved.");
    const input = createInterface({ input: stdin, output: stdout });
    try { while (browser.isConnected()) {
    try {
    await page.getByRole("heading", { name: "Commission Statements", exact: true }).waitFor({ state: "visible", timeout: 900000 });
    stage = "collecting statement files";
    // Reload the downloader on retry so selector fixes can reuse this signed-in context.
    const moduleUrl = new URL("./carriers/uhcDownload.js", import.meta.url);
    moduleUrl.searchParams.set("attempt", String(Date.now()));
    const { downloadUhcMonth, downloadUhcYear } = await import(moduleUrl.href) as typeof import("./carriers/uhcDownload.js");
    if (year === undefined) {
      await downloadUhcMonth(page, month, actual);
      console.log("One requested UnitedHealthcare PDF/text pair preserved privately. No database records were changed.");
    } else {
      const result = await downloadUhcYear(page, Number(year), actual, resume);
      console.log(`UnitedHealthcare ${year}: ${result.saved.length} saved, ${result.reused.length} reused, ${result.failed.length} failed out of ${result.available} available months. No database records were changed.`);
      if (result.failed.length) throw new SafePortalError("Some requested UnitedHealthcare months could not be collected");
    }
    break;
    } catch (error: unknown) {
      if (!browser.isConnected() || page.isClosed()) throw error;
      if (error instanceof SafePortalError) console.error(error.message);
      console.error(`Paused during ${stage}. The signed-in browser remains open. No database records were changed.`);
      const answer = await input.question("Enter retry after correcting the issue, or quit to close the browser: ");
      if (answer.trim().toLowerCase() !== "retry") { process.exitCode = 1; break; }
    }
    } } finally { input.close(); }
  } finally { await browser.close(); }
}
main().catch((error: unknown) => { if (error instanceof SafePortalError) console.error(error.message); console.error(`UnitedHealthcare download did not complete during ${stage}. Source details withheld.`); process.exitCode = 1; });
