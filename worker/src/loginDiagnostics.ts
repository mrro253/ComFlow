import { mkdir } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import type { Page } from "playwright";

/** Explicit local opt-in only. Never include credentials in diagnostic captures. */
export async function captureLoginReview(page: Page) {
  const directory = process.env.CARRIER_DIAGNOSTICS_DIR;
  if (!directory || !isAbsolute(directory)) return;
  try {
    await mkdir(directory, { recursive: true });
    await page.screenshot({
      path: join(directory, "uhc-sign-in-review.png"),
      mask: [page.locator("input, textarea, select")],
      timeout: 10000,
    });
    console.warn("Private UHC sign-in diagnostic saved with form fields masked.");
  } catch {
    console.warn("Private UHC sign-in diagnostic was unavailable.");
  }
}
