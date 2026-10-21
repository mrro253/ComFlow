import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { Page } from "playwright";
import { downloadDevotedPeriod, downloadDevotedYear } from "../carriers/devotedDownload";
const roots: string[] = [];
async function directory() { const root = await mkdtemp(path.join(os.tmpdir(), "comflow-devoted-test-")); roots.push(root); return root; }
afterEach(async () => {
  for (const root of roots.splice(0)) {
    if (path.dirname(root) !== path.resolve(os.tmpdir()) || !path.basename(root).startsWith("comflow-devoted-test-")) throw new Error("Unsafe test cleanup path");
    await rm(root, { recursive: true, force: true });
  }
});
function fixture(periods: string[][], invalidSheet = false) {
  let current = 0;
  const get = vi.fn(async (url: string) => ({ ok: () => true, status: () => 200, dispose: vi.fn(),
    body: async () => Buffer.from(url.includes(".pdf") ? "%PDF-synthetic" : invalidSheet ? "<html>Error</html>" : "PK\x03\x04 synthetic xl/workbook.xml") }));
  const row = (i: number) => ({ waitFor: async () => undefined, innerText: async () => `${periods[current][i]} page ${current}`,
    getByRole: (role: string, opts?: { name?: string }) => role === "cell" ? { first: () => ({ innerText: async () => periods[current][i] }) }
      : { getAttribute: async () => `https://devoted-files-prod.s3.us-east-2.amazonaws.com/synthetic/page${current}-row${i}.${opts?.name?.includes("pdf") ? "pdf" : "xlsx"}` } });
  const rows = { count: async () => periods[current].length, first: () => row(0), nth: row };
  const next = { count: async () => 1, isEnabled: async () => current < periods.length - 1, click: async () => { current++; } };
  const page = { context: () => ({ request: { get } }), getByRole: (role: string) => role === "row" ? { filter: () => rows } : role === "button" ? { first: () => next } : {} } as unknown as Page;
  return { page, get };
}
describe("Devoted paired local downloads", () => {
  it("finds a period on a later page and preserves a complete source pair", async () => {
    const root = await directory(); const mock = fixture([["Oct 30, 2026"], ["Sep 25, 2026"]]);
    const result = await downloadDevotedPeriod(mock.page, "2026-09-25", root);
    expect(mock.get).toHaveBeenCalledTimes(2); expect(result.payDate).toBe("2026-09-25");
    expect(await readdir(root)).toHaveLength(3);
    expect((await readFile(path.join(root, result.pdf.file))).subarray(0, 5).toString()).toBe("%PDF-");
  });
  it("does not download a missing period or ambiguous date across pages", async () => {
    for (const periods of [[["Oct 30, 2026"]], [["Sep 25, 2026"], ["Sep 25, 2026"]]]) {
      const root = await directory(); const mock = fixture(periods);
      await expect(downloadDevotedPeriod(mock.page, "2026-09-25", root)).rejects.toThrow();
      expect(mock.get).not.toHaveBeenCalled(); expect(await readdir(root)).toEqual([]);
    }
  });
  it("never records a complete pair when the spreadsheet is an error page", async () => {
    const root = await directory(); const mock = fixture([["Sep 25, 2026"]], true);
    await expect(downloadDevotedPeriod(mock.page, "2026-09-25", root)).rejects.toThrow("format");
    expect(await readdir(root)).toEqual([]);
  });
  it("reuses identical local files and refuses to overwrite corrupted existing content", async () => {
    const root = await directory(); const mock = fixture([["Sep 25, 2026"]]);
    const first = await downloadDevotedPeriod(mock.page, "2026-09-25", root);
    await downloadDevotedPeriod(mock.page, "2026-09-25", root);
    expect(await readdir(root)).toHaveLength(3);
    await writeFile(path.join(root, first.pdf.file), "synthetic corrupted file");
    await expect(downloadDevotedPeriod(mock.page, "2026-09-25", root)).rejects.toThrow("integrity");
    expect(await readFile(path.join(root, first.pdf.file), "utf8")).toBe("synthetic corrupted file");
  });
});

describe("Devoted explicit year downloads", () => {
  it("downloads every matching period across pages, excluding other years", async () => {
    const root = await directory(); const mock = fixture([["Sep 25, 2026", "Aug 28, 2026"], ["Dec 12, 2025"]]);
    const result = await downloadDevotedYear(mock.page, 2026, root);
    expect(result.found).toBe(2); expect(result.saved).toHaveLength(2); expect(result.failed).toEqual([]);
    expect(result.saved.map((row) => row.payDate)).toEqual(["2026-09-25", "2026-08-28"]);
    expect(mock.get).toHaveBeenCalledTimes(4);
    expect(mock.get.mock.calls.every(([url]) => !url.includes("page1"))).toBe(true);
  });
  it("refuses ambiguous dates before downloading any files", async () => {
    const root = await directory(); const mock = fixture([["Sep 25, 2026"], ["Sep 25, 2026"]]);
    await expect(downloadDevotedYear(mock.page, 2026, root)).rejects.toThrow("manual review");
    expect(mock.get).not.toHaveBeenCalled();
  });
  it("reports failed pairs without claiming success", async () => {
    const root = await directory(); const mock = fixture([["Sep 25, 2026"]], true);
    const result = await downloadDevotedYear(mock.page, 2026, root);
    expect(result.saved).toEqual([]); expect(result.failed).toEqual(["2026-09-25"]);
    expect(await readdir(root)).toEqual([]);
  });
  it("rejects an invalid year or a year without statements", async () => {
    const root = await directory(); const mock = fixture([["Sep 25, 2026"]]);
    await expect(downloadDevotedYear(mock.page, 2025, root)).rejects.toThrow("No Devoted");
    await expect(downloadDevotedYear(mock.page, 2026.5, root)).rejects.toThrow("Invalid");
    expect(mock.get).not.toHaveBeenCalled();
  });
});
