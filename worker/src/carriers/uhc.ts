import { chromium, type Browser, type Page } from "playwright";
import { syncUhcYear } from "./uhcDownload.js";
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
    try {
      await options.onVerification?.();
      await page.goto(UHC_STATEMENTS_URL);
      // Autofill only on the known identity provider, with unambiguous visible inputs.
      if (new URL(page.url()).hostname === "identity.onehealthcareid.com") {
        const username = page.locator('input[autocomplete="username"]:visible, input[type="email"]:visible');
        const password = page.locator('input[type="password"]:visible');
        if (await username.count() === 1 && await password.count() === 1) {
          await username.fill(login.username); await password.fill(login.password);
        }
      }
      await page.getByRole("heading", { name: "Commission Statements", exact: true }).waitFor({ state: "visible", timeout: 1800000 });
      const total = { found: 0, downloaded: 0, skipped: 0, failed: 0 };
      for (const year of options.years) {
        const summary = await syncUhcYear(page, year, options.onUhcPair);
        for (const key of ["found", "downloaded", "skipped", "failed"] as const) total[key] += summary[key];
      }
      return total;
    } catch {
      throw new SafePortalError("UnitedHealthcare sync paused. Its browser stays open. Complete verification and open Commissions > Statements and More, then retry Sync now. No commission entries were imported.");
    }
  },
};
export type UhcSourcePair = { pdf: Buffer; text: Buffer; filename: string; statementMonth: string; payeeHash: string };
