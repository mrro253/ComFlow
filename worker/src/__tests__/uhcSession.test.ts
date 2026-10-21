import { beforeEach, describe, expect, it, vi } from "vitest";
import { UHC_STATEMENTS_URL } from "../carriers/uhcMetadata";
import { SafePortalError } from "../carriers/types";
import { uhcPortal } from "../carriers/uhc";
import type { PullOptions } from "../carriers/types";
const mock = vi.hoisted(() => ({ launch: vi.fn(), wait: vi.fn(), year: vi.fn(), goto: vi.fn(), currentUrl: "" }));
vi.mock("playwright", () => ({ chromium: { launch: mock.launch } }));
vi.mock("../carriers/uhcLoader.js", () => ({ loadUhcDownloader: async () => ({ syncUhcYear: mock.year }) }));
beforeEach(() => {
  vi.clearAllMocks(); mock.currentUrl = UHC_STATEMENTS_URL; mock.wait.mockReset();
  const page = { isClosed: () => false, goto: mock.goto, url: () => mock.currentUrl, getByRole: () => ({ waitFor: mock.wait }) };
  mock.launch.mockResolvedValue({ isConnected: () => true, newContext: async () => ({ newPage: async () => page }) });
  mock.year.mockResolvedValue({ found: 1, downloaded: 0, skipped: 1, failed: 0 });
});
describe("UHC verification session", () => {
  it("keeps its window and retries without relaunching after verification timeout", async () => {
    const options: PullOptions = { years: [2026], sessionKey: "synthetic-connection", isKnown: () => true, log: () => {}, onStatement: async () => {}, onUhcPair: async () => "duplicate" };
    mock.wait.mockRejectedValueOnce(new Error("private browser diagnostic")).mockResolvedValueOnce(undefined);
    await expect(uhcPortal.pull({ username: "synthetic", password: "synthetic" }, options)).rejects.toThrow("browser stays open");
    expect(await uhcPortal.pull({ username: "synthetic", password: "synthetic" }, options)).toEqual({ found: 1, downloaded: 0, skipped: 1, failed: 0 });
    expect(mock.launch).toHaveBeenCalledTimes(1); expect(mock.year).toHaveBeenCalledTimes(1); expect(mock.goto).not.toHaveBeenCalled();
  });
  it("reports safe causes and hides raw browser diagnostics", async () => {
    const options: PullOptions = { years: [2026], sessionKey: "diagnostics", isKnown: () => false, log: vi.fn(), onStatement: async () => {}, onUhcPair: async () => "stored" };
    mock.wait.mockResolvedValue(undefined);
    mock.year.mockRejectedValueOnce(new SafePortalError("Requested UnitedHealthcare report option is unavailable"));
    await expect(uhcPortal.pull({ username: "synthetic", password: "synthetic" }, options)).rejects.toThrow("option is unavailable");
    mock.year.mockRejectedValueOnce(new Error("secret source diagnostic"));
    await expect(uhcPortal.pull({ username: "synthetic", password: "synthetic" }, options)).rejects.toThrow("Could not complete reading report controls");
    expect(JSON.stringify((options.log as ReturnType<typeof vi.fn>).mock.calls)).not.toContain("secret source");
  });

});
