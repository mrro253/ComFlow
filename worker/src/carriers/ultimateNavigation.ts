import type { Page } from "playwright";
import { SafePortalError } from "./types.js";

function trusted(value: string) {
  try { const url = new URL(value); return url.protocol === "https:" && url.hostname === "enroll.myultimatehp.com" && !url.username && !url.password; }
  catch { return false; }
}
async function ready(page: Page) {
  return !page.isClosed() && trusted(page.url()) && await page.getByRole("combobox").count() >= 2 && await page.getByRole("button", { name: "Search", exact: true }).isVisible();
}

/** Follow an observed statement link, not a same-text menu heading. Keep popup sessions. */
export async function openUltimateStatements(page: Page, log: (message: string) => void): Promise<Page> {
  if (await ready(page)) return page;
  const popups: Page[] = [];
  const onPopup = (popup: Page) => { popups.push(popup); };
  page.on("popup", onPopup);
  try {
    const labels = page.getByText("Commission Statements", { exact: true });
    let clicked = false;
    for (let index = 0; index < await labels.count(); index++) {
      const item = labels.nth(index);
      if (!await item.isVisible()) continue;
      const anchor = item.locator("xpath=ancestor-or-self::a[1]");
      const href = await anchor.count() === 1 ? await anchor.getAttribute("href") : null;
      if (href && !href.startsWith("javascript:") && href !== "#") {
        const destination = new URL(href, page.url());
        if (!trusted(destination.href)) throw new SafePortalError("Ultimate statement link points outside the trusted portal; navigation was stopped.");
        if (destination.href !== page.url()) {
          log("Opening the observed Commission Statements link.");
          try { await page.goto(destination.href, { waitUntil: "domcontentloaded" }); } catch { /* Confirm rendered controls below. */ }
          clicked = true; break;
        }
      }
      await item.click(); clicked = true; break;
    }
    if (!clicked) throw new SafePortalError("The signed-in portal has no visible Commission Statements navigation control.");
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) {
      for (const candidate of [page, ...popups]) if (await ready(candidate)) return candidate;
      await page.waitForTimeout(250);
    }
    log(`Statement navigation diagnostics: ${await page.getByRole("combobox").count()} dropdowns; ${popups.length} popup(s); ${page.frames().length - 1} embedded frame(s).`);
    throw new SafePortalError("Commission Statements did not open. The portal is not at the statement search; year availability has not been checked.");
  } finally { page.off("popup", onPopup); }
}
