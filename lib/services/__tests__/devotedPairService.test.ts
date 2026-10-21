import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeTextPdf } from "@/lib/pdf/__fixtures__/makeTextPdf";
import { syntheticPair } from "@/lib/carriers/devoted/__fixtures__/syntheticPair";
import { parseDevotedBytes, devotedPreview, approveDevoted } from "../devotedPairService";
import type { CurrentUser } from "@/types/domain";
const mocks = vi.hoisted(() => ({ context: vi.fn(), importPair: vi.fn() }));
vi.mock("@/lib/repositories/devotedRepository", () => ({ loadDevotedContext: mocks.context, registerAndImportDevoted: mocks.importPair }));
const user = { id: "synthetic-owner", agencyId: "synthetic-agency", role: "owner", active: true } as CurrentUser;
function files() { return { pdf: makeTextPdf(syntheticPair().pdfText.split("\n")), workbook: readFileSync(new URL("../../workbooks/__fixtures__/devoted-synthetic.xlsx", import.meta.url)) }; }
beforeEach(() => {
  vi.clearAllMocks(); vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "synthetic-test-secret"); vi.stubEnv("DEVOTED_IMPORT_REVIEW_ENABLED", "false");
  mocks.context.mockResolvedValue({ owners: new Map(), prior: [] }); mocks.importPair.mockResolvedValue("synthetic-id");
});
describe("Devoted preview and approval boundary", () => {
  it("parses source bytes but previews never register sources or commissions", async () => {
    const f = files(); const p = await devotedPreview(user, f.pdf, f.workbook);
    expect(p.pair.statement.statementTotalCents).toBe(2891); expect(p.plan.assignments[0].status).toBe("review");
    expect(mocks.importPair).not.toHaveBeenCalled();
  });
  it("denies nonowners and import remains disabled by default", async () => {
    const f = files(); await expect(devotedPreview({ ...user, role: "agent" }, f.pdf, f.workbook)).rejects.toThrow("owner");
    await expect(approveDevoted(user, f.pdf, f.workbook, "a".repeat(64), false)).rejects.toThrow("disabled");
    expect(mocks.context).not.toHaveBeenCalled(); expect(mocks.importPair).not.toHaveBeenCalled();
  });
  it("requires a server-issued digest and rebuilds before approval", async () => {
    vi.stubEnv("DEVOTED_IMPORT_REVIEW_ENABLED", "true"); const f = files();
    const p = await devotedPreview(user, f.pdf, f.workbook);
    await expect(approveDevoted(user, f.pdf, f.workbook, "f".repeat(64), false)).rejects.toThrow("Preview has changed");
    expect(mocks.importPair).not.toHaveBeenCalled();
    expect(await approveDevoted(user, f.pdf, f.workbook, p.digest, false)).toBe("synthetic-id");
    expect(mocks.importPair).toHaveBeenCalledOnce();
  });
  it("rejects a changed file even if the same economics remain", async () => {
    vi.stubEnv("DEVOTED_IMPORT_REVIEW_ENABLED", "true"); const f = files(); const p = await devotedPreview(user, f.pdf, f.workbook);
    await expect(approveDevoted(user, Buffer.concat([f.pdf, Buffer.from("\n%changed")]), f.workbook, p.digest, false)).rejects.toThrow("Preview has changed");
    expect(mocks.importPair).not.toHaveBeenCalled();
  });
  it("rejects an identical already imported pair", async () => {
    vi.stubEnv("DEVOTED_IMPORT_REVIEW_ENABLED", "true"); const f = files(); const pair = await parseDevotedBytes(f.pdf, f.workbook);
    mocks.context.mockResolvedValue({ owners: new Map(), prior: [{ id: "old-id", pairHash: pair.pairHash, payDate: pair.payDate, payeeHash: pair.payeeHash }] });
    const p = await devotedPreview(user, f.pdf, f.workbook);
    await expect(approveDevoted(user, f.pdf, f.workbook, p.digest, false)).rejects.toThrow("already imported");
    expect(mocks.importPair).not.toHaveBeenCalled();
  });
  it("holds corrections until explicitly approved and detects changed context", async () => {
    vi.stubEnv("DEVOTED_IMPORT_REVIEW_ENABLED", "true"); const f = files(); const pair = await parseDevotedBytes(f.pdf, f.workbook);
    mocks.context.mockResolvedValue({ owners: new Map(), prior: [{ id: "old-id", pairHash: "d".repeat(64), payDate: pair.payDate, payeeHash: pair.payeeHash }] });
    const p = await devotedPreview(user, f.pdf, f.workbook);
    await expect(approveDevoted(user, f.pdf, f.workbook, p.digest, false)).rejects.toThrow("correction approval");
    await expect(approveDevoted(user, f.pdf, f.workbook, p.digest, true)).resolves.toBe("synthetic-id");
    expect(mocks.importPair).toHaveBeenLastCalledWith(user, expect.anything(), f.pdf, f.workbook, expect.any(Array), ["old-id"], ["old-id"]);
    mocks.importPair.mockClear();
    mocks.context.mockResolvedValue({ owners: new Map(), prior: [] });
    await expect(approveDevoted(user, f.pdf, f.workbook, p.digest, true)).rejects.toThrow("Preview has changed");
    expect(mocks.importPair).not.toHaveBeenCalled();
  });
});
