import { setVerificationVisible } from "./backgroundBrowser.js";
import { SafePortalError } from "./carriers/types.js";
import type { LoginHelp } from "../../lib/carriers/syncResult.js";
import type { Page } from "playwright";
import type { CarrierLogin } from "./carriers/types.js";
export { trustedLoginUrl, type LoginCarrier } from "./carrierLoginFlow.js";
import type { LoginCarrier } from "./carrierLoginFlow.js";
/** Retry can load a sign-in fix without discarding the adapter's in-memory browser. */
export async function automaticCarrierLogin(page: Page, carrier: LoginCarrier, login: CarrierLogin, ready: () => Promise<boolean>, needsUser: (reason: LoginHelp) => Promise<void>) {
  const moduleUrl = new URL("./carrierLoginFlow.js", import.meta.url);
  moduleUrl.searchParams.set("retry", String(Date.now()));
  const flow = await import(moduleUrl.href) as typeof import("./carrierLoginFlow.js");
  try {
    return await flow.automaticCarrierLogin(page, carrier, login, ready, async reason => {
      await needsUser(reason);
      if (reason === "sign_in_review") {
        throw new SafePortalError("Sign-in review needed. Check your saved login in Carrier connections, then retry Sync now.");
      }
    }, visible => setVerificationVisible(page, visible));
  } finally {
    await setVerificationVisible(page, false);
  }
}
