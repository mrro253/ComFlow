import type { Page, Locator } from "playwright";
import type { CarrierLogin } from "./carriers/types.js";
import { SafePortalError } from "./carriers/types.js";

export type LoginCarrier = "Devoted Health" | "UnitedHealthcare" | "Ultimate Health Plans" | "SunFire";
const HOSTS: Record<LoginCarrier, readonly string[]> = {
  "Devoted Health": ["agent.devoted.com", "devoted.auth0.com"],
  "UnitedHealthcare": ["www.uhcjarvis.com", "identity.onehealthcareid.com"],
  "Ultimate Health Plans": ["enroll.myultimatehp.com"],
  "SunFire": ["www.sunfirematrix.com", "auth.sunfirematrix.com"],
};
export function trustedLoginUrl(carrier: LoginCarrier, value: string): boolean {
  try { const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password && HOSTS[carrier].includes(url.hostname); } catch { return false; }
}
async function uniqueVisible(locator: Locator) { return await locator.count() === 1 && await locator.isVisible(); }
/** Submit a username/password at most once per request. Never submit codes or challenge forms. */
export async function automaticCarrierLogin(page: Page, carrier: LoginCarrier, login: CarrierLogin, ready: () => Promise<boolean>, needsUser: () => Promise<void>) {
  const enter = async (field: Locator, value: string) => {
    if (carrier === "UnitedHealthcare") {
      // One Healthcare ID updates validation on typing and blur, not only input replacement.
      await field.fill("");
      await field.pressSequentially(value, { delay: 30 });
      await field.press("Tab");
      if (await field.inputValue() !== value) throw new SafePortalError("The carrier changed a login field before submission. Saved credentials were not submitted.");
    } else await field.fill(value);
  };
  let usernameSubmitted = false, passwordSubmitted = false, entryClicked = false, notified = false;
  const started = Date.now();
  let destinationOpened = false;
  const deadline = Date.now() + 30 * 60 * 1000;
  while (Date.now() < deadline && !page.isClosed()) {
    if (trustedLoginUrl(carrier, page.url()) && await ready()) return;
    if (!trustedLoginUrl(carrier, page.url())) throw new SafePortalError("Carrier sign-in reached an unrecognized destination. Saved credentials were not submitted there.");
    const current = new URL(page.url());
    const target = carrier === "UnitedHealthcare" ? "https://www.uhcjarvis.com/content/jarvis/en/secure/commissions/statements.html" : carrier === "Devoted Health" ? "https://agent.devoted.com/commissions" : null;
    if ((usernameSubmitted || passwordSubmitted) && target && !destinationOpened && current.hostname === new URL(target).hostname && current.pathname !== new URL(target).pathname) {
      // Let the carrier finish exchanging its callback code before leaving this route.
      const signedIn = carrier === "Devoted Health"
        ? page.getByText("Commissions", { exact: true }).first()
        : page.getByText(/You are now accessing/).first();
      if (await signedIn.isVisible()) { await page.goto(target); destinationOpened = true; continue; }
    }
    const accountChange = /reset|recover|change.password|signup|register/.test(current.pathname.toLowerCase()) || await page.locator('input[autocomplete="new-password"]:visible').count() > 0;
    const challenge = page.locator('input[autocomplete="one-time-code"]:visible, input[name="code"]:visible, input[name="otp"]:visible, iframe[title*="challenge" i]:visible, iframe[title*="captcha" i]:visible');
    const alert = page.getByRole("alert");
    const rejected = page.getByText(/wrong (?:username|email|user id).*password|incorrect (?:username|email|user id).*password|invalid (?:username|email|user id).*password|username or password.*incorrect|credentials.*(?:invalid|incorrect)/i);
    if ((usernameSubmitted || passwordSubmitted) && await rejected.count() > 0 && await rejected.first().isVisible()) {
      throw new SafePortalError("The carrier rejected the saved login. Replace the saved username/password in Carrier connections, then retry Sync now. No automatic repeat attempt was made.");
    }
    if (accountChange || await challenge.count() > 0 || ((usernameSubmitted || passwordSubmitted) && await alert.count() > 0 && await alert.first().isVisible())) {
      if (!notified) { await needsUser(); notified = true; }
    } else if (!passwordSubmitted) {
      if (carrier === "Devoted Health" && new URL(page.url()).hostname === "agent.devoted.com" && !entryClicked) {
        const entry = page.getByRole("button", { name: "Login", exact: true });
        if (await uniqueVisible(entry)) { if (!trustedLoginUrl(carrier, page.url())) throw new SafePortalError("Sign-in destination changed"); await entry.click(); entryClicked = true; continue; }
      }
      const username = carrier === "UnitedHealthcare" ? page.locator('input#username:visible') : carrier === "Devoted Health" ? page.locator('input[name="username"]:visible') : page.locator('input[type="text"]:visible, input[type="email"]:visible, input:not([type]):visible');
      const password = page.locator('input[type="password"]:visible');
      const submit = page.getByRole("button", { name: carrier === "Devoted Health" ? /^Log In$/i : carrier === "Ultimate Health Plans" || carrier === "SunFire" ? /^LOGIN$/i : /^(Continue|Sign In|Log In|Next)$/i });
      if (await uniqueVisible(password) && await uniqueVisible(submit)) {
        if (await uniqueVisible(username) && await username.isEditable()) {
          if (!trustedLoginUrl(carrier, page.url())) throw new SafePortalError("Sign-in destination changed");
          await enter(username, login.username);
        }
        if (!trustedLoginUrl(carrier, page.url())) throw new SafePortalError("Sign-in destination changed");
        try { await enter(password, login.password); }
        catch { throw new SafePortalError("The carrier password field could not be filled. The saved password was not submitted."); }
        if (!trustedLoginUrl(carrier, page.url())) throw new SafePortalError("Sign-in destination changed");
        try { await submit.click(); }
        catch { throw new SafePortalError("The carrier password-submit button could not be activated. Review the open browser before retrying."); }
        passwordSubmitted = true; usernameSubmitted = true; continue;
      }
      if ((carrier === "UnitedHealthcare" || carrier === "SunFire") && !usernameSubmitted && await uniqueVisible(username) && await uniqueVisible(submit)) {
        if (!trustedLoginUrl(carrier, page.url())) throw new SafePortalError("Sign-in destination changed");
        await enter(username, login.username);
        if (!trustedLoginUrl(carrier, page.url())) throw new SafePortalError("Sign-in destination changed");
        await submit.click(); usernameSubmitted = true; continue;
      }
    }
    // A carrier may use a push approval, passkey or an unfamiliar verification screen.
    if ((usernameSubmitted || passwordSubmitted || entryClicked) && !notified) {
      const verification = page.getByText(/verification code|verify your identity|approve.*sign.in|check your.*email|security code|passkey/i);
      if (await verification.count() > 0 && await verification.first().isVisible()) { await needsUser(); notified = true; }
    }
    if (!notified && Date.now() - started > 20000) { await needsUser(); notified = true; }
    await page.waitForTimeout(500);
  }
  throw new SafePortalError("Carrier sign-in did not complete. The browser stays open; review its sign-in or verification message before retrying.");
}
