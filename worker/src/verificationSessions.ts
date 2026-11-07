import { randomUUID } from "node:crypto";
import type { Page, Locator } from "playwright";
import type { VerificationRequest, VerificationState } from "../../lib/carriers/verificationProtocol.js";

type Session = { id: string; page: Page; enabled: boolean; expires: number; busy: boolean; origin: string };
const sessions = new Map<string, Session>();
const hosts = new Set(["enroll.myultimatehp.com", "agent.devoted.com", "devoted.auth0.com", "www.uhcjarvis.com", "identity.onehealthcareid.com", "www.sunfirematrix.com", "auth.sunfirematrix.com"]);
const delivery = { sms: /^(Via Text Message|Send text message|Text me a code)$/i, call: /^(Via Call|Call me)$/i, resend: /^(Resend code|Resend security code|Send a new code)$/i };
const otp = 'input[autocomplete="one-time-code"]:visible,input[name="code"]:visible,input[name="otp"]:visible';
export function registerVerification(connectionId: string, page: Page) {
  const session: Session = { id: randomUUID(), page, enabled: false, expires: Date.now() + 30 * 60_000, busy: false, origin: "" };
  sessions.set(connectionId, session);
  page.context().on("close", () => { if (sessions.get(connectionId) === session) sessions.delete(connectionId); });
}
export function enableVerification(connectionId: string, page: Page, enabled: boolean) {
  const session = sessions.get(connectionId);
  if (!session || session.page !== page) throw new Error("Verification session is unavailable");
  session.enabled = enabled;
  if (!enabled) session.origin = "";
  if (enabled && !session.origin) session.origin = new URL(page.url()).origin;
}
async function single(locator: Locator) { return await locator.count() === 1 && await locator.isVisible() && await locator.isEnabled(); }
async function inspect(session: Session): Promise<VerificationState> {
  const { page } = session;
  if (!session.enabled || page.isClosed() || Date.now() > session.expires) return { status: "waiting" };
  const url = new URL(page.url());
  if (url.protocol !== "https:" || url.username || url.password || !hosts.has(url.hostname) || url.origin !== session.origin) return { status: "unavailable" };
  if (await page.locator('input[type="password"]:visible,input[autocomplete="username"]:visible').count()) return { status: "unavailable" };
  if (await page.locator('iframe[src*="recaptcha"]:visible,iframe[src*="hcaptcha"]:visible,input[autocomplete="new-password"]:visible').count()) return { status: "unavailable" };
  const headings = page.getByText(/verification code|verify your identity|security code|verify your email|enter.*code/i);
  let visible = false;
  for (let i = 0; i < Math.min(await headings.count(), 30); i++) if (await headings.nth(i).isVisible()) { visible = true; break; }
  if (!visible) return { status: "waiting" };
  const choices: (keyof typeof delivery)[] = [];
  for (const action of ["sms", "call", "resend"] as const) if (await single(page.getByRole("button", { name: delivery[action] }))) choices.push(action);
  const acceptsCode = await single(page.locator(otp)) && await single(page.getByRole("button", { name: /^(Verify|Verify code|Continue|Submit)$/i }));
  if (!choices.length && !acceptsCode) return { status: "unavailable" };
  return { status: "ready", sessionId: session.id, choices, acceptsCode };
}
export async function handleVerification(request: VerificationRequest): Promise<VerificationState> {
  const session = sessions.get(request.connectionId);
  if (!session) return { status: "waiting" };
  if (session.busy) throw new Error("Verification is already processing");
  session.busy = true;
  try {
    const state = await inspect(session);
    if (request.action === "state") return state;
    if (state.status !== "ready" || request.sessionId !== session.id) throw new Error("Verification screen changed");
    session.id = randomUUID();
    // Only fixed actions are exposed. No browser URL, selector, screenshot or client-supplied script.
    if (request.action === "code") {
      if (!state.acceptsCode || !request.code) throw new Error("Code input is unavailable");
      await session.page.locator(otp).fill(request.code, { timeout: 3000 });
      await session.page.getByRole("button", { name: /^(Verify|Verify code|Continue|Submit)$/i }).click({ timeout: 3000 });
    } else {
      if (!state.choices?.includes(request.action)) throw new Error("Verification choice is unavailable");
      await session.page.getByRole("button", { name: delivery[request.action] }).click({ timeout: 3000 });
    }
    // A transition can take time; never repeat a submission automatically.
    return { status: "waiting" };
  } finally { session.busy = false; }
}
