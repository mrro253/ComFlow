import { expect, it, vi } from "vitest";
import type { Page } from "playwright";
import { enableVerification, handleVerification, registerVerification } from "../verificationSessions";
import type { VerificationRequest } from "../../../lib/carriers/verificationProtocol";

function fixture() {
  let url = "https://identity.onehealthcareid.com/verify", password = false, challenge = true;
  const fill = vi.fn(async () => {}), click = vi.fn(async () => {});
  const control = (exists: boolean) => ({ count: async () => exists ? 1 : 0, isVisible: async () => exists, isEnabled: async () => exists, fill, click });
  const page = {
    context: () => ({ on: vi.fn() }), isClosed: () => false, url: () => url,
    locator: (selector: string) => control(selector.includes('type="password"') ? password : selector.includes("iframe") ? false : challenge),
    getByText: () => ({ count: async () => challenge ? 1 : 0, nth: () => ({ isVisible: async () => challenge }) }),
    getByRole: (_role: string, options: { name: RegExp }) => control(challenge && options.name.test("Verify")),
  } as unknown as Page;
  const connectionId = crypto.randomUUID(), request: VerificationRequest = { connectionId, agencyId: crypto.randomUUID(), userId: crypto.randomUUID(), action: "state" };
  registerVerification(connectionId, page); enableVerification(connectionId, page, true);
  return { request, page, fill, click, url: (value: string) => { url = value; }, password: () => { password = true; }, normal: () => { challenge = false; } };
}
it("returns only form capabilities and submits a code once per screen token", async () => {
  const f = fixture(), state = await handleVerification(f.request);
  expect(state.status).toBe("ready"); expect(state.acceptsCode).toBe(true);
  expect(JSON.stringify(state)).not.toContain("https:");
  const action = { ...f.request, action: "code" as const, sessionId: state.sessionId, code: "123456" };
  await handleVerification(action);
  expect(f.fill).toHaveBeenCalledWith("123456", { timeout: 3000 });
  await expect(handleVerification(action)).rejects.toThrow("screen changed");
  expect(f.click).toHaveBeenCalledOnce();
});
it("never exposes password, unrelated or cross-origin pages", async () => {
  const f = fixture(); f.password(); expect((await handleVerification(f.request)).status).toBe("unavailable");
  const g = fixture(); g.normal(); expect((await handleVerification(g.request)).status).toBe("waiting");
  const h = fixture(); h.url("https://example.com/verify"); expect((await handleVerification(h.request)).status).toBe("unavailable");
});
it("rejects stale and unsupported actions and hides the form after verification", async () => {
  const f = fixture(); const state = await handleVerification(f.request);
  await expect(handleVerification({ ...f.request, action: "sms", sessionId: state.sessionId })).rejects.toThrow("choice is unavailable");
  enableVerification(f.request.connectionId, f.page, false);
  expect(await handleVerification(f.request)).toEqual({ status: "waiting" });
});
it("expires verification sessions", async () => {
  const f = fixture(); vi.useFakeTimers();
  try { vi.setSystemTime(Date.now() + 31 * 60_000); expect(await handleVerification(f.request)).toEqual({ status: "waiting" }); }
  finally { vi.useRealTimers(); }
});
