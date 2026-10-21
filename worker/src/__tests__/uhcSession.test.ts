import { beforeEach, describe, expect, it, vi } from "vitest";
import { uhcPortal } from "../carriers/uhc";
import type { PullOptions } from "../carriers/types";
const mock = vi.hoisted(() => ({ launch: vi.fn(), wait: vi.fn(), year: vi.fn() }));
vi.mock("playwright", () => ({ chromium: { launch: mock.launch } }));
vi.mock("../carriers/uhcDownload.js", () => ({ syncUhcYear: mock.year }));
beforeEach(() => {
  vi.clearAllMocks();
  const page = { isClosed: () => false, goto: async () => undefined, url: () => "https://www.uhcjarvis.com/", getByRole: () => ({ waitFor: mock.wait }) };
  mock.launch.mockResolvedValue({ isConnected: () => true, newContext: async () => ({ newPage: async () => page }) });
  mock.year.mockResolvedValue({ found: 1, downloaded: 0, skipped: 1, failed: 0 });
});
describe("UHC verification session", () => {
  it("keeps its window and retries without relaunching after verification timeout", async () => {
    const options: PullOptions = { years: [2026], sessionKey: "synthetic-connection", isKnown: () => true, log: () => {}, onStatement: async () => {}, onUhcPair: async () => "duplicate" };
    mock.wait.mockRejectedValueOnce(new Error("private browser diagnostic")).mockResolvedValueOnce(undefined);
    await expect(uhcPortal.pull({ username: "synthetic", password: "synthetic" }, options)).rejects.toThrow("browser stays open");
    expect(await uhcPortal.pull({ username: "synthetic", password: "synthetic" }, options)).toEqual({ found: 1, downloaded: 0, skipped: 1, failed: 0 });
    expect(mock.launch).toHaveBeenCalledTimes(1); expect(mock.year).toHaveBeenCalledTimes(1);
  });
});
