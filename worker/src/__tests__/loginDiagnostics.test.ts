import { afterEach, expect, it, vi } from "vitest";
import type { Page } from "playwright";
import { captureLoginReview } from "../loginDiagnostics";
vi.mock("node:fs/promises", () => ({ mkdir: vi.fn() }));
afterEach(() => vi.unstubAllEnvs());
it("does not capture login pages without an explicit absolute private destination", async () => {
  const screenshot = vi.fn();
  const page = { screenshot } as unknown as Page;
  vi.stubEnv("CARRIER_DIAGNOSTICS_DIR", "");
  await captureLoginReview(page);
  vi.stubEnv("CARRIER_DIAGNOSTICS_DIR", "relative-folder");
  await captureLoginReview(page);
  expect(screenshot).not.toHaveBeenCalled();
});
it("masks every form field in an opted-in capture", async () => {
  vi.stubEnv("CARRIER_DIAGNOSTICS_DIR", "C:\\private-diagnostics");
  const mask = {};
  const screenshot = vi.fn(async () => {});
  const locator = vi.fn(() => mask);
  await captureLoginReview({ screenshot, locator } as unknown as Page);
  expect(locator).toHaveBeenCalledWith("input, textarea, select");
  expect(screenshot).toHaveBeenCalledWith(expect.objectContaining({ mask: [mask], timeout: 10000 }));
});
