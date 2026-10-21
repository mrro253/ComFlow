import { beforeEach, describe, expect, it, vi } from "vitest";
import { registerAndImportDevoted } from "../devotedRepository";
import { parseDevotedPair } from "@/lib/carriers/devoted/parseDevotedPair";
import { syntheticPair } from "@/lib/carriers/devoted/__fixtures__/syntheticPair";
import { sha256 } from "@/lib/carriers/digest";
import type { CurrentUser } from "@/types/domain";
const mocks = vi.hoisted(() => ({ upload: vi.fn(), download: vi.fn(), rpc: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ storage: { from: () => ({ upload: mocks.upload, download: mocks.download }) }, rpc: mocks.rpc }) }));
const user = { id: "synthetic-owner", agencyId: "synthetic-agency" } as CurrentUser;
const pdf = Buffer.from("synthetic-pdf"), workbook = Buffer.from("synthetic-workbook");
function pair() { return parseDevotedPair({ ...syntheticPair(), pdfHash: sha256(pdf), workbookHash: sha256(workbook) }); }
beforeEach(() => vi.clearAllMocks());
describe("Devoted source preservation", () => {
  it("never registers an incomplete pair after the second upload fails", async () => {
    mocks.upload.mockResolvedValueOnce({ error: null }).mockResolvedValueOnce({ error: { statusCode: "500" } });
    mocks.download.mockResolvedValueOnce({ data: new Blob([pdf]), error: null });
    await expect(registerAndImportDevoted(user, pair(), pdf, workbook, [], [], [])).rejects.toThrow("preserve");
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.upload.mock.calls[0][2].upsert).toBe(false);
  });
  it("rejects conflicting existing object content rather than overwriting it", async () => {
    mocks.upload.mockResolvedValueOnce({ error: { statusCode: "409" } });
    mocks.download.mockResolvedValueOnce({ data: new Blob(["changed"]), error: null });
    await expect(registerAndImportDevoted(user, pair(), pdf, workbook, [], [], [])).rejects.toThrow("fingerprint");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("does not upload source bytes after their fingerprint changes", async () => {
    await expect(registerAndImportDevoted(user, pair(), Buffer.from("changed"), workbook, [], [], [])).rejects.toThrow("fingerprints changed");
    expect(mocks.upload).not.toHaveBeenCalled(); expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
