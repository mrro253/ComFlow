import { chromium, type BrowserContext, type BrowserContextOptions, type CDPSession, type Page } from "playwright";
import { SafePortalError } from "./carriers/types.js";
import { enableVerification, registerVerification } from "./verificationSessions.js";

interface Presentation {
  verificationPage: Page | null;
  failure: Error | null;
  pending: Promise<void>;
  sessions: WeakMap<Page, Promise<CDPSession>>;
}

const presentations = new WeakMap<BrowserContext, Presentation>();
const hostedContexts = new WeakSet<BrowserContext>();
const hostedBindings = new WeakMap<BrowserContext, string>();

/** Keep the same in-memory carrier session while changing only its window visibility. */
export async function setVerificationVisible(page: Page, visible: boolean): Promise<void> {
  const context = page.context();
  if (hostedContexts.has(context)) {
    const binding = hostedBindings.get(context);
    if (binding && process.env.HOSTED_VERIFICATION_ENABLED === "true") {
      enableVerification(binding, page, visible);
      return;
    }
    if (visible) {
      // No general browser or remote desktop may be exposed as a fallback.
      throw new SafePortalError("Cloud verification is not available yet. Sync stopped without showing the carrier browser.");
    }
    return;
  }
  const presentation = presentations.get(context);
  // Standalone developer download commands keep their existing interactive behavior.
  if (!presentation) return;

  const update = presentation.pending.then(async () => {
    if (presentation.failure) throw presentation.failure;
    if (page.isClosed()) return;
    if (visible && presentation.verificationPage === page) return;
    let session = presentation.sessions.get(page);
    if (!session) {
      session = context.newCDPSession(page);
      presentation.sessions.set(page, session);
    }
    const protocol = await session;
    const { windowId, bounds } = await protocol.send("Browser.getWindowForTarget");
    if (visible) {
      if (bounds.windowState !== "normal") {
        await protocol.send("Browser.setWindowBounds", { windowId, bounds: { windowState: "normal" } });
      }
      await protocol.send("Browser.setWindowBounds", {
        windowId, bounds: { left: 80, top: 80, width: 1100, height: 800 },
      });
      await page.bringToFront();
      presentation.verificationPage = page;
    } else {
      if (bounds.windowState !== "minimized") {
        await protocol.send("Browser.setWindowBounds", { windowId, bounds: { windowState: "minimized" } });
      }
      const current = await protocol.send("Browser.getWindowBounds", { windowId });
      if (current.bounds.windowState !== "minimized") throw new Error("Background window was not minimized");
      presentation.verificationPage = null;
    }
  });
  presentation.pending = update.catch(async () => {
    presentation.failure = new SafePortalError("Background browser controls are unavailable. Sync stopped; try Sync now again.");
    // Do not continue collection in a visible window when concealment fails.
    await context.browser()?.close().catch(() => undefined);
  });
  try {
    await update;
  } catch {
    await presentation.pending;
    throw presentation.failure;
  }
}

/** App-triggered sessions start minimized, before any carrier page is loaded. */
export async function createBackgroundSession(options: BrowserContextOptions, connectionId?: string) {
  const mode = process.env.CARRIER_BROWSER_MODE ?? "desktop";
  if (mode !== "desktop" && mode !== "hosted") {
    throw new SafePortalError("Carrier browser mode is invalid. Sync stopped.");
  }
  const hosted = mode === "hosted";
  const browser = await chromium.launch({
    headless: hosted,
    args: hosted ? [] : ["--start-minimized", "--window-position=-32000,-32000"],
  });
  try {
    const context = await browser.newContext(options);
    if (hosted) {
      hostedContexts.add(context);
      const page = await context.newPage();
      if (connectionId && process.env.HOSTED_VERIFICATION_ENABLED === "true") {
        hostedBindings.set(context, connectionId);
        registerVerification(connectionId, page);
      }
      return { browser, page };
    }
    presentations.set(context, {
      verificationPage: null,
      failure: null,
      pending: Promise.resolve(),
      sessions: new WeakMap(),
    });
    context.on("page", page => {
      // Popups used by PDF downloads also stay in the background.
      void setVerificationVisible(page, false).catch(() => undefined);
      page.on("framenavigated", frame => {
        if (frame === page.mainFrame()) {
          // Sending/resending a code can navigate between verification steps.
          // The login flow decides when verification has actually finished.
          if (presentations.get(context)?.verificationPage !== page) {
            void setVerificationVisible(page, false).catch(() => undefined);
          }
        }
      });
    });
    // Carrier scripts can restore a window without navigating (including after
    // verification). Recheck idle and collecting windows as well as navigation.
    let checking = false;
    const concealmentCheck = setInterval(async () => {
      if (checking) return;
      checking = true;
      try {
        const presentation = presentations.get(context);
        for (const page of context.pages()) {
          if (!page.isClosed() && presentation?.verificationPage !== page) {
            await setVerificationVisible(page, false);
          }
        }
      } catch {
        // setVerificationVisible closes the browser if concealment fails.
      } finally {
        checking = false;
      }
    }, 500);
    concealmentCheck.unref();
    context.on("close", () => clearInterval(concealmentCheck));
    const page = await context.newPage();
    await setVerificationVisible(page, false);
    return { browser, page };
  } catch {
    await browser.close().catch(() => undefined);
    throw new SafePortalError("Could not start the background carrier browser. Try Sync now again.");
  }
}
