import { mkdir, realpath } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { downloadDevotedPeriod, downloadDevotedYear } from "./carriers/devotedDownload.js";

async function main() {
  const args = process.argv.slice(2);
  const payDate = args.includes("--date") ? args[args.indexOf("--date") + 1] : undefined;
  const yearText = args.includes("--year") ? args[args.indexOf("--year") + 1] : undefined;
  const output = args[args.indexOf("--output") + 1];
  if (args.includes("--date") === args.includes("--year") || !args.includes("--output") || !path.isAbsolute(output ?? "")) {
    throw new Error("Provide exactly one of --date YYYY-MM-DD or --year YYYY, plus an absolute --output outside the repository");
  }
  if (payDate !== undefined && (!/^20\d{2}-(0[1-9]|1[0-2])-([0-2]\d|3[01])$/.test(payDate) ||
      new Date(`${payDate}T00:00:00Z`).toISOString().slice(0, 10) !== payDate)) throw new Error("Invalid pay date");
  if (args.includes("--date") && payDate === undefined) throw new Error("Missing pay date");
  if (args.includes("--year") && !/^20\d{2}$/.test(yearText ?? "")) throw new Error("Invalid year");
  const root = await realpath(fileURLToPath(new URL("../..", import.meta.url)));
  await mkdir(output, { recursive: true });
  const actual = await realpath(output);
  const relative = path.relative(root, actual);
  if (relative === "" || (!relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))) {
    throw new Error("Keep source downloads outside the repository");
  }
  const browser = await chromium.launch({ headless: false });
  try {
    const context = await browser.newContext({ acceptDownloads: true });
    const page = await context.newPage();
    await page.goto("https://agent.devoted.com/commissions");
    console.log("Sign in to Devoted in the worker browser and complete any verification. Open My Commissions. No credentials or sessions are saved.");
    await page.getByRole("heading", { name: "My Commissions", exact: true }).waitFor({ state: "visible", timeout: 180000 });
    if (payDate !== undefined) {
      await downloadDevotedPeriod(page, payDate, actual);
      console.log("One Devoted PDF/spreadsheet pair preserved locally. No database records were changed.");
    } else {
      const result = await downloadDevotedYear(page, Number(yearText), actual);
      console.log(`Devoted ${result.year}: ${result.saved.length} of ${result.found} source pairs preserved; ${result.failed.length} failed. No database records were changed.`);
      if (result.failed.length) process.exitCode = 1;
    }
  } finally { await browser.close(); }
}
main().catch(() => { console.error("Devoted download did not complete. Check sign-in, the requested period and the local output directory. Private details withheld."); process.exitCode = 1; });
