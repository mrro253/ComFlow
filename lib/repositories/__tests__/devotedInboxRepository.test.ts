import { beforeEach, describe, expect, it, vi } from "vitest";
import { readDevotedInbox } from "../devotedInboxRepository";
import { sha256 } from "@/lib/carriers/digest";
import type { CurrentUser } from "@/types/domain";
const mock = vi.hoisted(() => ({ authorized: true, download: vi.fn(), admin: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ from: () => {
  const query = { select: () => query, eq: () => query, maybeSingle: async () => ({ data: mock.authorized ? { id: "connection" } : null, error: null }) }; return query;
} }) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => { mock.admin(); return { storage: { from: () => ({ download: mock.download }) } }; } }));
const user = { id: "owner", agencyId: "agency", role: "owner", active: true } as CurrentUser;
const pdf = Buffer.from("synthetic PDF"), workbook = Buffer.from("synthetic workbook");
const pairHash = sha256(JSON.stringify(["devoted-pair-v1", sha256(pdf), sha256(workbook)]));
beforeEach(() => { vi.clearAllMocks(); mock.authorized = true; });
describe("downloaded Devoted review authorization", () => {
  it("denies cross-connection, invalid reference and non-owner reads before admin storage", async () => {
    mock.authorized = false;
    await expect(readDevotedInbox(user, "other", pairHash)).rejects.toThrow();
    await expect(readDevotedInbox(user, "connection", "../other")).rejects.toThrow();
    await expect(readDevotedInbox({ ...user, role: "agent" }, "connection", pairHash)).rejects.toThrow();
    expect(mock.admin).not.toHaveBeenCalled();
  });
  it("verifies both bytes against their manifest and pair fingerprint", async () => {
    const manifest = { pairHash, pdfHash: sha256(pdf), workbookHash: sha256(workbook) };
    mock.download.mockImplementation(async (path: string) => ({ error: null, data: new Blob([path.endsWith(".json") ? JSON.stringify(manifest) : path.endsWith(".pdf") ? pdf : workbook]) }));
    const result = await readDevotedInbox(user, "connection", pairHash);
    expect(Buffer.from(result.pdf)).toEqual(pdf);
    expect(mock.download.mock.calls.every(([path]) => path.startsWith("agency/devoted-inbox/connection/"))).toBe(true);
    mock.download.mockImplementation(async (path: string) => ({ error: null, data: new Blob([path.endsWith(".json") ? JSON.stringify(manifest) : "corrupted"]) }));
    await expect(readDevotedInbox(user, "connection", pairHash)).rejects.toThrow("integrity");
  });
});
