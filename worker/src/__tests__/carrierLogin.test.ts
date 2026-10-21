import { describe, expect, it, vi } from "vitest";
import type { Page } from "playwright";
import { automaticCarrierLogin, trustedLoginUrl, type LoginCarrier } from "../carrierLoginFlow";
function fixture(carrier: LoginCarrier, initial?: string) {
  let state = initial ?? (carrier === "Devoted Health" ? "entry" : carrier === "UnitedHealthcare" ? "username" : "password");
  let closed = false;
  const fills: string[] = [], clicks: string[] = [];
  const url = () => state === "untrusted" ? "https://example.invalid/" : state === "reset" ? "https://devoted.auth0.com/reset" : carrier === "Devoted Health" ? state === "entry" || state === "ready" ? "https://agent.devoted.com/commissions" : "https://devoted.auth0.com/login" : carrier === "UnitedHealthcare" ? state === "ready" ? "https://www.uhcjarvis.com/content/jarvis/en/secure/commissions/statements.html" : "https://identity.onehealthcareid.com/login" : "https://enroll.myultimatehp.com/agportal/#/login";
  const needs = vi.fn(async () => { if (state === "challenge") state = "ready"; else closed = true; });
  const locator = (selector: string) => {
    const count = () => selector.includes('new-password') ? state === "reset" ? 1 : 0 : selector.includes('one-time-code') ? state === "challenge" ? 1 : 0 : selector.includes('type="password"') ? ["password", "reset"].includes(state) ? 1 : 0 : ["username", "password"].includes(state) ? 1 : 0;
    return { count: async () => count(), isVisible: async () => count() > 0, fill: async (_value: string) => { fills.push(selector.includes('password') ? "password" : "username"); } };
  };
  const page = { url, isClosed: () => closed, locator, goto: async () => {}, waitForTimeout: async () => {}, getByText: () => ({ count: async () => 0 }), getByRole: (role: string, options?: {name: string | RegExp}) => {
    if (role === "alert") return { count: async () => state === "bad" ? 1 : 0, first: () => ({ isVisible: async () => state === "bad" }) };
    const name = state === "entry" ? "Login" : carrier === "Devoted Health" ? "Log In" : carrier === "UnitedHealthcare" ? state === "username" ? "Continue" : "Sign In" : "LOGIN";
    const visible = () => ["entry", "username", "password"].includes(state) && (typeof options?.name === "string" ? options.name === name : options?.name.test(name));
    return { count: async () => visible() ? 1 : 0, isVisible: async () => Boolean(visible()), click: async () => { clicks.push(name); state = state === "entry" || state === "username" ? "password" : initial === "password" ? "bad" : carrier === "UnitedHealthcare" ? "challenge" : "ready"; } };
  } } as unknown as Page;
  return { page, fills, clicks, needs, ready: async () => state === "ready" };
}
const login = { username: "synthetic-user", password: "synthetic-password" };
describe("automatic carrier login", () => {
  it.each(["Devoted Health", "UnitedHealthcare", "Ultimate Health Plans"] as const)("submits saved credentials for %s", async (carrier) => {
    const f = fixture(carrier); await automaticCarrierLogin(f.page, carrier, login, f.ready, f.needs);
    expect(f.fills).toContain("username"); expect(f.fills.filter(v => v === "password")).toHaveLength(1);
    expect(f.clicks).toHaveLength(carrier === "Ultimate Health Plans" ? 1 : 2);
    expect(f.needs).toHaveBeenCalledTimes(carrier === "UnitedHealthcare" ? 1 : 0);
  });
  it("does not resubmit credentials for an already authenticated session", async () => {
    const f = fixture("Devoted Health", "ready"); await automaticCarrierLogin(f.page, "Devoted Health", login, f.ready, f.needs);
    expect(f.fills).toEqual([]); expect(f.clicks).toEqual([]);
  });
  it("never fills an untrusted destination or submits password-reset forms", async () => {
    for (const initial of ["untrusted", "reset"]) {
      const f = fixture("Devoted Health", initial);
      await expect(automaticCarrierLogin(f.page, "Devoted Health", login, f.ready, f.needs)).rejects.toThrow();
      expect(f.fills).toEqual([]); expect(f.clicks).toEqual([]);
    }
  });
  it("does not repeatedly submit a rejected password", async () => {
    const f = fixture("Devoted Health", "password");
    await expect(automaticCarrierLogin(f.page, "Devoted Health", login, f.ready, f.needs)).rejects.toThrow();
    expect(f.clicks).toHaveLength(1); expect(f.fills.filter(v => v === "password")).toHaveLength(1); expect(f.needs).toHaveBeenCalledOnce();
  });
  it("requires exact HTTPS hosts and rejects lookalike domains", () => {
    expect(trustedLoginUrl("Devoted Health", "https://devoted.auth0.com/login")).toBe(true);
    for (const url of ["http://devoted.auth0.com/login", "https://devoted.auth0.com.evil.invalid/", "https://user:pass@devoted.auth0.com/"]) expect(trustedLoginUrl("Devoted Health", url)).toBe(false);
  });
});
