import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { chromium, type APIRequestContext, type Download, type Locator, type Page } from "playwright";
import { safeError, statementIdentifier } from "../safeError.js";
import {
  SafePortalError,
  type CarrierLogin,
  type CarrierPortal,
  type PullOptions,
  type PullSummary,
} from "./types.js";

/**
 * Ultimate Health Plans agent portal. Ported from Ryan's prototype
 * (ultimate-sync.js / ultimate-portal.js / ultimate-download.js).
 *
 * UNVERIFIED against the live portal in this repo: the selectors and flow are
 * copied from the working prototype, but this port has not been run end to end.
 * Portal markup changes will break it; keep selectors in this file only.
 * No saved browser sessions: every run logs in fresh and closes the browser.
 */

const CARRIER = "Ultimate Health Plans";
const LOGIN_URL = "https://enroll.myultimatehp.com/agportal/#/login";
const MAX_PAGES = 100;

const pause = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function waitUntil(
  check: () => Promise<boolean>,
  { timeout, message }: { timeout: number; message: string }
): Promise<void> {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await check()) return;
    await pause(250);
  }
  throw new SafePortalError(message);
}

// ---------------------------------------------------------------------------
// PDF download (native download, popup, or authenticated HTTPS fallback)
// ---------------------------------------------------------------------------

async function requestPdf(request: APIRequestContext, url: string, attempts = 3): Promise<Buffer> {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" || parsed.username || parsed.password) {
    throw new SafePortalError("Invalid PDF download URL");
  }
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const response = await request.get(url, { timeout: 30_000 });
      try {
        const status = response.status();
        if (!response.ok()) {
          const retryable = status === 408 || status === 429 || status >= 500;
          if (retryable && attempt < attempts) {
            await pause(500 * attempt);
            continue;
          }
          throw new SafePortalError(`PDF request failed: HTTP ${status}`);
        }
        const buffer = Buffer.from(await response.body());
        if (buffer.subarray(0, 5).toString() !== "%PDF-") {
          throw new SafePortalError("Downloaded content is not a PDF; the login may have expired");
        }
        return buffer;
      } finally {
        await response.dispose();
      }
    } catch (error) {
      if (error instanceof SafePortalError) throw error;
      if (attempt === attempts) throw new SafePortalError("PDF network request failed after retries");
      await pause(500 * attempt);
    }
  }
  throw new SafePortalError("PDF network request failed after retries");
}

async function downloadPdf(page: Page, link: Locator, timeoutMs = 120_000): Promise<Buffer> {
  const request = page.context().request;
  const popups = new Set<Page>();
  let settled = false;
  let nativeDownloadStarted = false;
  let resolveResult!: (buffer: Buffer) => void;
  let rejectResult!: (error: unknown) => void;
  const result = new Promise<Buffer>((resolve, reject) => {
    resolveResult = resolve;
    rejectResult = reject;
  });

  const finish = (error: unknown, buffer?: Buffer) => {
    if (settled) return;
    settled = true;
    if (error) rejectResult(error);
    else resolveResult(buffer as Buffer);
  };

  const onDownload = async (download: Download) => {
    nativeDownloadStarted = true;
    try {
      const failure = await download.failure();
      // Some environments cancel browser-managed saves: fetch the same HTTPS
      // resource with the browser's authenticated request context instead.
      const buffer = failure ? await requestPdf(request, download.url()) : await readFile(await download.path());
      if (buffer.subarray(0, 5).toString() !== "%PDF-") throw new SafePortalError("Downloaded content is not a PDF");
      finish(null, buffer);
    } catch (error) {
      finish(error);
    }
  };

  const onPopup = async (popup: Page) => {
    popups.add(popup);
    popup.on("download", onDownload);
    try {
      await popup.waitForURL(/^https:\/\//, { waitUntil: "domcontentloaded", timeout: 15_000 });
      if (!settled && !nativeDownloadStarted) finish(null, await requestPdf(request, popup.url()));
    } catch (error) {
      // A PDF attachment can close its popup while the download event completes.
      if (!nativeDownloadStarted && !popup.isClosed()) finish(error);
    }
  };

  page.on("download", onDownload);
  page.on("popup", onPopup);
  const timer = setTimeout(() => finish(new SafePortalError("Timed out waiting for a PDF download")), timeoutMs);
  const clicked = link.click().catch((error) => finish(error));
  try {
    return await result;
  } finally {
    clearTimeout(timer);
    page.off("download", onDownload);
    page.off("popup", onPopup);
    for (const popup of popups) popup.off("download", onDownload);
    await clicked;
    await Promise.all([...popups].map((popup) => popup.close().catch(() => undefined)));
  }
}

// ---------------------------------------------------------------------------
// Results table
// ---------------------------------------------------------------------------

interface ResultState {
  count: number;
  empty: boolean;
  signature: string;
}

function resultState(page: Page): Promise<ResultState> {
  return page.locator("#ContentSection").evaluate((element) => {
    const rows = Array.from(element.querySelectorAll("tbody tr"));
    const details = rows.filter((row) => row.querySelectorAll("td").length >= 4);
    const empty = /no (records|data|statements|results)(?: were)? (?:found|available)|no data to display/i.test(
      element.textContent || ""
    );
    return { count: details.length, empty, signature: details.map((row) => row.textContent).join("|") };
  });
}

async function syncResults(
  page: Page,
  options: PullOptions,
  summary: PullSummary
): Promise<void> {
  const seenPages = new Set<string>();
  const seenStatements = new Set<string>();

  await waitUntil(
    async () => {
      const state = await resultState(page);
      return state.count > 0 || state.empty;
    },
    { timeout: 30_000, message: "Statement results did not load" }
  );

  for (let pageNumber = 1; pageNumber <= MAX_PAGES; pageNumber++) {
    const state = await resultState(page);
    if (state.empty && state.count === 0) break;

    const signature = createHash("sha256").update(state.signature).digest("hex");
    if (seenPages.has(signature)) throw new SafePortalError("Pagination repeated a page; sync stopped to prevent a loop");
    seenPages.add(signature);

    const rows = page.locator("#ContentSection tbody tr").filter({ has: page.locator("td:nth-child(4)") });
    const count = await rows.count();
    for (let index = 0; index < count; index++) {
      summary.found++;
      try {
        const cells = rows.nth(index).locator("td");
        const metadata = {
          payeeId: (await cells.nth(0).innerText()).trim(),
          period: (await cells.nth(1).innerText()).trim(),
          filename: (await cells.nth(2).innerText()).trim(),
        };
        if (Object.values(metadata).some((value) => !value)) throw new SafePortalError("Statement metadata is incomplete");

        const id = statementIdentifier(metadata);
        if (seenStatements.has(id) || options.isKnown(id)) {
          summary.skipped++;
          continue;
        }

        const link = cells.nth(3).locator("a[href]").first();
        await link.waitFor({ state: "visible", timeout: 10_000 });
        const pdf = await downloadPdf(page, link);
        await options.onStatement({ carrierStatementId: id, filename: metadata.filename, pdf });
        seenStatements.add(id);
        summary.downloaded++;
      } catch (error) {
        summary.failed++;
        // Keep portal names, account ids and signed URLs out of logs.
        options.log(`page ${pageNumber} row ${index + 1} failed: ${safeError(error)}`);
      }
    }

    const next = page
      .locator("#ContentSection")
      .locator("a, button")
      .filter({ hasText: /^\s*(next|›|»)\s*$/i })
      .first();
    if ((await next.count()) === 0 || !(await next.isVisible())) break;
    const disabled = await next.evaluate(
      (element) =>
        element.matches(':disabled, [aria-disabled="true"], .disabled') || Boolean(element.closest(".disabled"))
    );
    if (disabled) break;
    if (pageNumber === MAX_PAGES) throw new SafePortalError("Pagination exceeded the safety limit");

    await next.click();
    await waitUntil(async () => (await resultState(page)).signature !== state.signature, {
      timeout: 15_000,
      message: "Next statement page did not load",
    });
  }
}

// ---------------------------------------------------------------------------
// Portal
// ---------------------------------------------------------------------------

export const ultimatePortal: CarrierPortal = {
  carrier: CARRIER,

  async pull(login: CarrierLogin, options: PullOptions): Promise<PullSummary> {
    const summary: PullSummary = { found: 0, downloaded: 0, skipped: 0, failed: 0 };
    const browser = await chromium.launch({ headless: true });
    try {
      const context = await browser.newContext({ acceptDownloads: true });
      const page = await context.newPage();

      await page.goto(LOGIN_URL);
      await page.locator("input").nth(0).fill(login.username);
      await page.locator('input[type="password"]').fill(login.password);
      await page.getByRole("button", { name: "LOGIN" }).click();

      const menu = page.getByText("Commission Statements", { exact: true }).first();
      try {
        await menu.waitFor({ state: "visible", timeout: 30_000 });
      } catch {
        throw new SafePortalError(
          "Login did not complete. Check the username and password; the portal may also be asking for extra verification."
        );
      }

      for (const year of options.years) {
        options.log(`searching ${year}`);
        await menu.click();
        const dropdowns = page.getByRole("combobox");
        await waitUntil(async () => (await dropdowns.first().locator(`option[value="${year}"]`).count()) === 1, {
          timeout: 15_000,
          message: `The portal does not list ${year} statements`,
        });
        await dropdowns.first().selectOption(String(year));
        await dropdowns.nth(1).selectOption("0");
        await page.getByRole("button", { name: "Search" }).click();
        await syncResults(page, options, summary);
      }
      return summary;
    } catch (error) {
      if (error instanceof SafePortalError) throw error;
      throw new SafePortalError(safeError(error));
    } finally {
      await browser.close().catch(() => undefined);
    }
  },
};
