import { automaticCarrierLogin } from "../carrierLogin.js";
import { chromium, type Browser, type Page } from "playwright";
import { loadUhcDownloader } from "./uhcLoader.js";
import { UHC_STATEMENTS_URL } from "./uhcMetadata.js";
import { SafePortalError, type CarrierPortal } from "./types.js";

const sessions = new Map<string, { browser: Browser; page: Page }>();
export const uhcPortal: CarrierPortal = {
  carrier: "UnitedHealthcare",
  async pull(login, options) {
    if (!options.sessionKey || !options.onUhcPair) throw new SafePortalError("UnitedHealthcare paired sync is not configured");
    let session = sessions.get(options.sessionKey);
    if (!session || !session.browser.isConnected() || session.page.isClosed()) {
      const browser = await chromium.launch({ headless: false });
      const context = await browser.newContext({ acceptDownloads: true });
      session = { browser, page: await context.newPage() };
      sessions.set(options.sessionKey, session);
    }
    const { page } = session;
    let stage = "opening Jarvis";
    try {
      await options.onProgress?.();
      if (page.url() !== UHC_STATEMENTS_URL) await page.goto(UHC_STATEMENTS_URL);
      stage = "signing in or waiting for verification";
      await automaticCarrierLogin(page, "UnitedHealthcare", login,
        () => page.getByRole("heading", { name: "Commission Statements", exact: true }).isVisible(),
        async (reason) => { await options.onVerification?.(reason); });
      stage = "reading report controls";
      const { syncUhcYear } = await loadUhcDownloader();
      const total = { found: 0, downloaded: 0, skipped: 0, failed: 0 };
      for (const year of options.years) {
        const summary = await syncUhcYear(page, year, options.onUhcPair, options.log);
        for (const key of ["found", "downloaded", "skipped", "failed"] as const) total[key] += summary[key];
      }
      return total;
    } catch (error) {
      const detail = error instanceof SafePortalError ? error.message : `Could not complete ${stage}.`;
      options.log(`UnitedHealthcare paused: ${detail}`);
      throw new SafePortalError(`UnitedHealthcare paused: ${detail} The browser stays open. Resolve the issue there, then retry Sync now. No commission entries imported.`);
    }
  },
};
export type UhcSourcePair = { pdf: Buffer; text: Buffer; filename: string; statementMonth: string; payeeHash: string };
