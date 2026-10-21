import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Page, APIRequestContext } from "playwright";
import { assertDevotedFile, devotedFile, devotedPayDate } from "./devotedMetadata.js";
import { SafePortalError } from "./types.js";

async function fetchFile(request: APIRequestContext, url: string, format: "pdf" | "xlsx") {
  const file = devotedFile(url, format);
  for (let attempt = 0; attempt < 3; attempt++) {
    const response = await request.get(file.url, { timeout: 30000, maxRedirects: 0 });
    try {
      if ([408, 429, 500, 502, 503, 504].includes(response.status()) && attempt < 2) {
        await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
        continue;
      }
      if (!response.ok()) throw new SafePortalError("Devoted file download failed; check session and statement availability");
      const bytes = await response.body();
      assertDevotedFile(bytes, format);
      return bytes;
    } finally { await response.dispose(); }
  }
  throw new SafePortalError("Devoted download retries exhausted");
}

/** Saves each content hash once. Existing files are verified, never overwritten. */
async function preserve(directory: string, bytes: Buffer, extension: string) {
  const hash = createHash("sha256").update(bytes).digest("hex");
  const target = path.join(directory, `${hash}.${extension}`);
  try { await writeFile(target, bytes, { flag: "wx" }); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    if (!bytes.equals(await readFile(target))) throw new SafePortalError("Existing local download failed integrity verification");
  }
  return { sha256: hash, file: path.basename(target) };
}

/** Download-only operation on an already authenticated worker page. No database writes or imports. */
async function listPeriods(page: Page) {
  const matches: { payDate: string; pdfUrl: string; sheetUrl: string }[] = [];
  const rows = page.getByRole("row").filter({ has: page.getByRole("link", { name: "file-pdf View PDF", exact: true }) });
  for (let pageNumber = 0; pageNumber < 100; pageNumber++) {
    await rows.first().waitFor({ state: "visible", timeout: 30000 });
    for (let i = 0; i < await rows.count(); i++) {
      const row = rows.nth(i);
      const payDate = devotedPayDate(await row.getByRole("cell").first().innerText());
      const pdfUrl = await row.getByRole("link", { name: "file-pdf View PDF", exact: true }).getAttribute("href");
      const sheetUrl = await row.getByRole("link", { name: "file-excel View Spreadsheet", exact: true }).getAttribute("href");
      if (!pdfUrl || !sheetUrl) throw new SafePortalError("Devoted statement is missing one of its source files");
      matches.push({ payDate, pdfUrl, sheetUrl });
    }
    const next = page.getByRole("button", { name: "right", exact: true }).first();
    if (await next.count() === 0 || !await next.isEnabled()) break;
    if (pageNumber === 99) throw new SafePortalError("Devoted statement pagination exceeded the safety limit");
    const previous = await rows.first().innerText();
    await next.click();
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline && await rows.first().innerText() === previous) {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    if (await rows.first().innerText() === previous) throw new SafePortalError("Devoted next statement page did not load");
  }
  return matches;
}

async function savePair(page: Page, source: { payDate: string; pdfUrl: string; sheetUrl: string }, directory: string) {
  // Fetch both before recording a complete pair. No source filename or signed URL is logged.
  const pdf = await fetchFile(page.context().request, source.pdfUrl, "pdf");
  const sheet = await fetchFile(page.context().request, source.sheetUrl, "xlsx");
  await mkdir(directory, { recursive: true });
  const record = { carrier: "Devoted Health", payDate: source.payDate, pdf: await preserve(directory, pdf, "pdf"),
    spreadsheet: await preserve(directory, sheet, "xlsx") };
  await preserve(directory, Buffer.from(JSON.stringify(record, null, 2)), "json");
  return record;
}

/** Explicit single-period download, preserving the original command behavior. */
export async function downloadDevotedPeriod(page: Page, payDate: string, directory: string) {
  const matches = (await listPeriods(page)).filter((row) => row.payDate === payDate);
  if (matches.length !== 1) throw new SafePortalError(matches.length === 0
    ? "Requested Devoted statement was not found; no complete pair was recorded"
    : "Multiple Devoted statements share this pay date; manual review is required");
  return savePair(page, matches[0], directory);
}

/** All available periods in exactly the approved year. No imports or other-year downloads. */
export async function downloadDevotedYear(page: Page, year: number, directory: string) {
  if (!Number.isInteger(year) || year < 2000 || year > 2099) throw new SafePortalError("Invalid Devoted statement year");
  const matches = (await listPeriods(page)).filter((row) => row.payDate.startsWith(`${year}-`));
  if (!matches.length) throw new SafePortalError("No Devoted statements are available for the requested year");
  if (new Set(matches.map((row) => row.payDate)).size !== matches.length) {
    throw new SafePortalError("Multiple Devoted statements share a pay date; manual review is required");
  }
  const saved: Awaited<ReturnType<typeof savePair>>[] = [];
  const failed: string[] = [];
  for (const row of matches) {
    try { saved.push(await savePair(page, row, directory)); }
    catch { failed.push(row.payDate); }
  }
  return { year, found: matches.length, saved, failed };
}
