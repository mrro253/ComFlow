import { beforeEach, describe, expect, it, vi } from "vitest";
import { getStatementWorklists } from "../statementWorklistService";
import type { StatementRecord } from "@/lib/repositories/statementRepository";
import type { CurrentUser } from "@/types/domain";
const mocks = vi.hoisted(() => ({ list: vi.fn(), download: vi.fn(), extract: vi.fn(), parse: vi.fn(), verify: vi.fn() }));
vi.mock("@/lib/repositories/statementRepository", () => ({ listStatementCoverage: mocks.list, downloadStatementPdf: mocks.download }));
vi.mock("@/lib/pdf/extractStatementPdf", () => ({ extractStatementPdf: mocks.extract }));
vi.mock("@/lib/carriers/uhc/parseUhcStatement", () => ({ readUhcStatement: mocks.parse }));
vi.mock("@/lib/carriers/ultimate/statementDetails", () => ({ verifiedUltimateDetails: mocks.verify }));
vi.mock("@/lib/repositories/devotedInboxRepository", () => ({ listDevotedInbox: async () => [] }));
const user = { id: "owner", agencyId: "agency", role: "owner", active: true } as CurrentUser;
const imported = { id: "imported", carrier: "UnitedHealthcare", userId: null, statementMonth: "2026-03", status: "imported", fileHash: "a".repeat(64), storagePath: "agency/imported.pdf" } as StatementRecord;
const pending = { ...imported, id: "repeat", status: "received", fileHash: "b".repeat(64), storagePath: "agency/repeat.pdf" } as StatementRecord;
beforeEach(() => {
  vi.clearAllMocks(); mocks.list.mockResolvedValue([imported, pending]);
  mocks.download.mockImplementation(async (path: string) => new Uint8Array([path.includes("imported") ? 1 : 2]));
  mocks.extract.mockImplementation(async (bytes: Uint8Array) => ({ sha256: (bytes[0] === 1 ? "a" : "b").repeat(64), text: "All printed tokens" }));
  mocks.parse.mockReturnValue({ statement: { transactions: [] }, details: [] });
  mocks.verify.mockReturnValue(new Map([["row", { clientName: "Example Person", fields: [{ label: "Notes", value: "Original source note" }] }]]));
});
describe("source-verified repeat statement worklists", () => {
  it("keeps semantically identical PDFs out of review without importing or changing them", async () => {
    const result = await getStatementWorklists(user); expect(result.duplicates.get("repeat")).toBe("imported"); expect(result.needsAttention).toEqual([]);
    expect(pending.status).toBe("received"); expect(mocks.download).toHaveBeenCalledTimes(2);
  });
  it("does not hide corrected notes, changed printed text or failed integrity checks", async () => {
    mocks.verify.mockReturnValueOnce(new Map([["row", { fields: [{ label: "Notes", value: "Corrected source note" }] }]]));
    expect((await getStatementWorklists(user)).needsAttention).toHaveLength(1);
    mocks.extract.mockImplementation(async (bytes: Uint8Array) => ({ sha256: "a".repeat(64), text: bytes[0] === 1 ? "Original" : "Corrected" }));
    expect((await getStatementWorklists(user)).needsAttention).toHaveLength(1);
    mocks.download.mockRejectedValue(new Error("Source unavailable")); expect((await getStatementWorklists(user)).needsAttention).toHaveLength(1);
  });
  it("enforces active statement access and never reads foreign storage paths or workbook pairs", async () => {
    await expect(getStatementWorklists({ ...user, role: "agent", agentType: "career" })).rejects.toThrow("access"); expect(mocks.list).not.toHaveBeenCalled();
    mocks.list.mockResolvedValue([imported, { ...pending, storagePath: "other-agency/private.pdf" }]);
    expect((await getStatementWorklists(user)).needsAttention).toHaveLength(1); expect(mocks.download).not.toHaveBeenCalledWith("other-agency/private.pdf");
    mocks.download.mockClear(); mocks.list.mockResolvedValue([{ ...imported, carrier: "Devoted Health" }, { ...pending, carrier: "Devoted Health" }]);
    expect((await getStatementWorklists(user)).needsAttention).toHaveLength(1); expect(mocks.download).not.toHaveBeenCalled();
  });
});
