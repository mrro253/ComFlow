import { beforeEach, expect, it, vi } from "vitest";
import { ultimatePortal } from "../carriers/ultimate";
import type { PullOptions } from "../carriers/types";
const mock = vi.hoisted(() => ({ launch: vi.fn(), close: vi.fn(), goto: vi.fn(), login: vi.fn(), url: "about:blank", usable: true }));
vi.mock("../backgroundBrowser.js", () => ({
  createBackgroundSession: async (options: unknown) => {
    const browser = await mock.launch();
    const context = await browser.newContext(options);
    return { browser, page: await context.newPage() };
  },
}));
vi.mock("../carrierLogin.js", () => ({ automaticCarrierLogin: (...args: unknown[]) => mock.login(...args) }));
beforeEach(() => {
  vi.clearAllMocks(); mock.goto.mockReset(); mock.url="about:blank"; mock.usable=true;
  const page = { url: () => mock.url, isClosed: () => false, goto: mock.goto,
    locator: () => ({ count: async () => mock.usable ? 1 : 0 }), getByRole: () => ({ isVisible: async () => mock.usable }),
    getByText: () => ({ first: () => ({ isVisible: async () => false }) }) };
  mock.launch.mockResolvedValue({ isConnected: () => true, close: mock.close, newContext: async () => ({ newPage: async () => page }) });
});
function options(sessionKey: string): PullOptions { return { sessionKey, years: [], isKnown: () => false, onStatement: async () => {}, log: vi.fn() }; }
it("uses DOM readiness and proceeds after an aborted navigation only with a trusted usable form", async () => {
  mock.goto.mockImplementation(async () => { mock.url="https://enroll.myultimatehp.com/agportal/#/login"; throw new Error("page.goto: net::ERR_ABORTED at https://example.invalid/private"); });
  await ultimatePortal.pull({ username:"synthetic",password:"synthetic" }, options("usable"));
  expect(mock.goto).toHaveBeenCalledWith(expect.any(String), { waitUntil:"domcontentloaded" });
  expect(mock.login).toHaveBeenCalledOnce();
});
it("does not submit credentials when navigation fails without the trusted form", async () => {
  mock.goto.mockImplementation(async () => { mock.url="chrome-error://chromewebdata/"; throw new Error("page.goto: https://example.invalid/private failed"); });
  await expect(ultimatePortal.pull({ username:"synthetic",password:"synthetic" }, options("unsafe"))).rejects.toThrow("Ultimate stopped while opening the login page");
  expect(mock.login).not.toHaveBeenCalled();
});
it("does not treat an incomplete page as a successful navigation", async () => {
  mock.usable=false;
  mock.goto.mockImplementation(async () => { mock.url="https://enroll.myultimatehp.com/agportal/#/login"; throw new Error("page.goto: https://example.invalid/private timed out"); });
  await expect(ultimatePortal.pull({ username:"synthetic",password:"synthetic" }, options("incomplete"))).rejects.toThrow("opening the login page");
  expect(mock.login).not.toHaveBeenCalled();
});

it("closes completed sessions and starts a fresh browser for the next sync", async () => {
  mock.goto.mockImplementation(async () => { mock.url = "https://enroll.myultimatehp.com/agportal/#/login"; });
  await ultimatePortal.pull({ username: "synthetic", password: "synthetic" }, options("finished"));
  await ultimatePortal.pull({ username: "synthetic", password: "synthetic" }, options("finished"));
  expect(mock.close).toHaveBeenCalledTimes(2);
  expect(mock.launch).toHaveBeenCalledTimes(2);
});
