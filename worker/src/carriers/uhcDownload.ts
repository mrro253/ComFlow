import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, realpath, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Page } from "playwright";
import { assertUhcFile, assertUhcPage, uhcDownloadName, uhcMonth } from "./uhcMetadata.js";
import { SafePortalError } from "./types.js";

async function preserve(directory: string, bytes: Buffer, extension: string) {
  const hash = createHash("sha256").update(bytes).digest("hex");
  const target = path.join(directory, `${hash}.${extension}`);
  try { await writeFile(target, bytes, { flag: "wx" }); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    if (!bytes.equals(await readFile(target))) throw new SafePortalError("Existing UnitedHealthcare source failed integrity verification");
  }
  return { sha256: hash, file: path.basename(target) };
}
const isMonthPrompt = (label: string) => /^(?:PLEASE )?(?:SELECT|CHOOSE)(?: A)?(?: MONTH)?[.\s-]*$/.test(label);
const VISIBLE_MENU_ITEMS = '[id^="downshift-"][id$="-menu"]:visible [id*="-item-"]';
const labelText = (text: string) => text.replace(/\s+/g, " ").trim().toUpperCase();
async function menuOptions(page: Page) {
  // Downshift leaves closed menus mounted. Read only the currently visible popup.
  const items = page.locator(VISIBLE_MENU_ITEMS);
  await items.first().waitFor({ state: "visible", timeout: 15000 });
  return (await items.allTextContents()).map(labelText);
}
async function selectControl(page: Page, name: string, value: string) {
  const control = page.getByRole("combobox", { name, exact: true });
  if (labelText(await control.innerText()) === value) return;
  await page.getByRole("button", { name, exact: true }).click();
  const options = await menuOptions(page);
  const index = options.indexOf(value);
  if (index < 0 || options.filter((option) => option === value).length !== 1) throw new SafePortalError("Requested UnitedHealthcare report option is unavailable");
  await page.locator(VISIBLE_MENU_ITEMS).nth(index).click();
  const deadline = Date.now() + 15000;
  while (labelText(await control.innerText()) !== value) {
    if (Date.now() >= deadline) throw new SafePortalError(`UnitedHealthcare ${name} selection did not update`);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}
async function source(page: Page, month: string, kind: "pdf" | "txt") {
  assertUhcPage(page.url());
  await selectControl(page, "Format", kind === "pdf" ? "PDF" : "TEXT");
  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 60000 }),
    page.getByRole("button", { name: "DOWNLOAD", exact: true }).click(),
  ]);
  if (!download.url().startsWith("blob:https://www.uhcjarvis.com/") || await download.failure()) throw new SafePortalError("UnitedHealthcare report download did not complete");
  const identity = uhcDownloadName(download.suggestedFilename(), month, kind);
  const localPath = await download.path();
  if (!localPath || (await stat(localPath)).size > 15 * 1024 * 1024) throw new SafePortalError("UnitedHealthcare download exceeds the source limit");
  const bytes = await readFile(localPath);
  assertUhcFile(bytes, kind);
  assertUhcPage(page.url());
  return { bytes, filename: download.suggestedFilename(), ...identity };
}
/** Explicit one-month operation on a signed-in worker page. No DB, credentials or import access. */
export async function readUhcMonth(page: Page, month: string) {
  const selected = uhcMonth(month);
  assertUhcPage(page.url());
  const party = await currentParty(page);
  await selectControl(page, "Year", selected.year);
  await selectControl(page, "Month", selected.month);
  const pdf = await source(page, month, "pdf");
  const text = await source(page, month, "txt");
  if (pdf.partyId !== text.partyId || pdf.partyId !== party) throw new SafePortalError("UnitedHealthcare PDF/text payee context does not match");
  return { pdf: pdf.bytes, text: text.bytes, filename: pdf.filename, statementMonth: month,
    payeeHash: createHash("sha256").update(party).digest("hex") };
}
export async function downloadUhcMonth(page: Page, month: string, directory: string) {
  const pair = await readUhcMonth(page, month);
  // Both sources must validate before a complete manifest is recorded.
  await mkdir(directory, { recursive: true });
  const record = { carrier: "UnitedHealthcare", statementMonth: month, payeeHash: pair.payeeHash,
    pdf: await preserve(directory, pair.pdf, "pdf"), text: await preserve(directory, pair.text, "txt") };
  await preserve(directory, Buffer.from(JSON.stringify(record, null, 2)), "json");
  return record;
}

async function currentParty(page: Page) {
  // Jarvis can render the account label and PID in separate sibling spans.
  // Read their nearest shared account container instead of just the label span.
  const header = await page.getByText(/You are now accessing/).first()
    .locator("xpath=ancestor-or-self::*[contains(., 'PID')][1]").innerText();
  const matches = [...header.matchAll(/\bPID\s*:\s*(\d+)(?=\s|[,;)\]]|$)/g)];
  const match = matches.length === 1 ? matches[0] : null;
  if (!match) throw new SafePortalError("UnitedHealthcare signed-in payee could not be verified");
  return match[1];
}
/** Explicit resume only: cached months are not proof of the latest portal revision. */
async function existingPair(directory: string, month: string, payeeHash: string) {
  let files: string[];
  try { files = await readdir(directory); } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return false; throw error; }
  const root = await realpath(directory);
  for (const filename of files.filter((file) => /^[a-f0-9]{64}\.json$/.test(file))) {
    const raw = await readFile(path.join(root, filename));
    const record = JSON.parse(raw.toString("utf8"));
    if (record.carrier !== "UnitedHealthcare" || record.statementMonth !== month || record.payeeHash !== payeeHash) continue;
    if (createHash("sha256").update(raw).digest("hex") + ".json" !== filename) throw new SafePortalError("Existing UnitedHealthcare manifest failed integrity verification");
    for (const kind of ["pdf", "text"] as const) {
      const source = record[kind], extension = kind === "pdf" ? "pdf" : "txt";
      if (!source || !/^[a-f0-9]{64}$/.test(source.sha256) || source.file !== `${source.sha256}.${extension}`) throw new SafePortalError("Invalid cached UnitedHealthcare source");
      const target = await realpath(path.join(root, source.file));
      if (!target.startsWith(root + path.sep)) throw new SafePortalError("Invalid cached UnitedHealthcare path");
      const bytes = await readFile(target);
      if (createHash("sha256").update(bytes).digest("hex") !== source.sha256) throw new SafePortalError("Existing UnitedHealthcare source failed integrity verification");
      assertUhcFile(bytes, extension);
    }
    return true;
  }
  return false;
}
export async function downloadUhcYear(page: Page, year: number, directory: string, resume = false) {
  if (!Number.isInteger(year) || year < 2000 || year > 2099) throw new SafePortalError("Invalid UnitedHealthcare statement year");
  assertUhcPage(page.url());
  const payeeHash = createHash("sha256").update(await currentParty(page)).digest("hex");
  await selectControl(page, "Year", String(year));
  await page.getByRole("button", { name: "Month", exact: true }).click();
  const options = await menuOptions(page);
  await page.getByRole("combobox", { name: "Month", exact: true }).press("Escape");
  const all = Array.from({ length: 12 }, (_, i) => `${year}-${String(i+1).padStart(2,"0")}`);
  if (!options.length || new Set(options).size !== options.length || options.some((label) => !isMonthPrompt(label) && !all.some((month) => uhcMonth(month).month === label))) {
    const recognized = options.filter((label) => all.some((month) => uhcMonth(month).month === label)).length;
    // Only month-like control labels can enter diagnostics; never arbitrary portal text.
    const unknown = options.filter((label) => !isMonthPrompt(label) && !all.some((month) => uhcMonth(month).month === label)).map((label) => /^(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)[A-Z .-]{0,18}$/.test(label) ? label : "unrecognized control label");
    throw new SafePortalError(`Unsupported UnitedHealthcare available-month list (${options.length} options, ${recognized} recognized months, ${options.filter(isMonthPrompt).length} prompts; ${unknown.join(", ")})`);
  }
  const months = all.filter((month) => options.includes(uhcMonth(month).month));
  const saved: string[] = [], reused: string[] = [], failed: string[] = [];
  for (const month of months) {
    try {
      if (resume && await existingPair(directory, month, payeeHash)) reused.push(month);
      else { await downloadUhcMonth(page, month, directory); saved.push(month); }
    } catch { failed.push(month); }
  }
  return { year, available: months.length, saved, reused, failed };
}

/** App sync always fetches current revisions; an old month ID is not proof of unchanged content. */
export async function syncUhcYear(page: Page, year: number, save: (pair: Awaited<ReturnType<typeof readUhcMonth>>) => Promise<"stored" | "duplicate">, log: (message: string) => void = () => {}) {
  if (!Number.isInteger(year) || year < 2000 || year > 2099) throw new SafePortalError("Invalid UnitedHealthcare statement year");
  assertUhcPage(page.url());
  await selectControl(page, "Year", String(year));
  await page.getByRole("button", { name: "Month", exact: true }).click();
  const options = await menuOptions(page);
  await page.getByRole("combobox", { name: "Month", exact: true }).press("Escape");
  const all = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, "0")}`);
  if (!options.length || new Set(options).size !== options.length || options.some((label) => !isMonthPrompt(label) && !all.some((month) => uhcMonth(month).month === label))) {
    const recognized = options.filter((label) => all.some((month) => uhcMonth(month).month === label)).length;
    // Only month-like control labels can enter diagnostics; never arbitrary portal text.
    const unknown = options.filter((label) => !isMonthPrompt(label) && !all.some((month) => uhcMonth(month).month === label)).map((label) => /^(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)[A-Z .-]{0,18}$/.test(label) ? label : "unrecognized control label");
    throw new SafePortalError(`Unsupported UnitedHealthcare available-month list (${options.length} options, ${recognized} recognized months, ${options.filter(isMonthPrompt).length} prompts; ${unknown.join(", ")})`);
  }
  const months = all.filter((month) => options.includes(uhcMonth(month).month));
  const summary = { found: months.length, downloaded: 0, skipped: 0, failed: 0 };
  for (const month of months) {
    try { if (await save(await readUhcMonth(page, month)) === "duplicate") summary.skipped++; else summary.downloaded++; }
    catch (error) {
      summary.failed++;
      log(`UnitedHealthcare ${month}: ${error instanceof SafePortalError ? error.message : "Report selection, download or storage did not complete; source details withheld"}`);
    }
  }
  return summary;
}
