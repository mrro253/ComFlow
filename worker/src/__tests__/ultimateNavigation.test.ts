import { expect, it, vi } from "vitest";
import type { Page } from "playwright";
import { openUltimateStatements } from "../carriers/ultimateNavigation";

function fixture(href: string | null, initiallyReady = false) {
  let loaded = initiallyReady;
  const goto = vi.fn(async () => { loaded = true; });
  const click = vi.fn(async () => { loaded = true; });
  const item = { isVisible: async () => true, click, locator: () => ({ count: async () => href ? 1 : 0, getAttribute: async () => href }) };
  const page = { isClosed: () => false, url: () => "https://enroll.myultimatehp.com/agportal/#/dashboard", goto,
    getByRole: (role: string) => role === "combobox" ? { count: async () => loaded ? 2 : 0 } : { isVisible: async () => loaded },
    getByText: () => ({ count: async () => 1, nth: () => item }), on: vi.fn(), off: vi.fn(), waitForTimeout: async () => {}, frames: () => [] } as unknown as Page;
  return { page, goto, click };
}
it("reuses a verified statement-search page instead of clicking a same-text heading", async () => {
  const f = fixture(null, true);
  expect(await openUltimateStatements(f.page, vi.fn())).toBe(f.page);
  expect(f.click).not.toHaveBeenCalled(); expect(f.goto).not.toHaveBeenCalled();
});
it("follows an observed trusted statement link rather than an inner menu label", async () => {
  const f = fixture("#/commissions");
  expect(await openUltimateStatements(f.page, vi.fn())).toBe(f.page);
  expect(f.goto).toHaveBeenCalledWith("https://enroll.myultimatehp.com/agportal/#/commissions", { waitUntil: "domcontentloaded" });
  expect(f.click).not.toHaveBeenCalled();
});
it("supports a real menu action without an anchor", async () => {
  const f = fixture(null);
  expect(await openUltimateStatements(f.page, vi.fn())).toBe(f.page);
  expect(f.click).toHaveBeenCalledOnce();
});
it("refuses an external statement destination without exposing its URL", async () => {
  const f = fixture("https://example.invalid/private?token=synthetic");
  await expect(openUltimateStatements(f.page, vi.fn())).rejects.toThrow("outside the trusted portal");
  expect(f.goto).not.toHaveBeenCalled(); expect(f.click).not.toHaveBeenCalled();
});
