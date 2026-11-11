import { beforeEach, expect, it, vi } from "vitest";
import { sha256 } from "@/lib/carriers/digest";
import { listStatementReview } from "../statementReviewService";
import type { StatementRecord } from "@/lib/repositories/statementRepository";

const mocks = vi.hoisted(() => ({ list: vi.fn(), download: vi.fn(), extract: vi.fn(), parse: vi.fn() }));
vi.mock("@/lib/repositories/statementRepository", () => ({ listStatementCoverage: mocks.list, downloadStatementPdf: mocks.download }));
vi.mock("@/lib/pdf/extractStatementPdf", () => ({ extractStatementPdf: mocks.extract }));
vi.mock("@/lib/carriers", () => ({ getStatementParser: () => ({ parse: mocks.parse }) }));
const bytes = new TextEncoder().encode("synthetic PDF bytes");
const pending: StatementRecord = { id: "pending", carrier: "Example", userId: "owner", statementMonth: null, status: "received", fileHash: sha256(bytes), storagePath: "visible/pending.pdf", source: "portal", originalFilename: null, statementTotalCents: null, carriedBalanceCents: null, transactionCount: null, errorMessage: null, createdAt: "2026-01-02", importedAt: null, supersededBy: null, supersededAt: null };
const prior: StatementRecord = { ...pending, id: "prior", statementMonth: "2026-01", status: "imported", storagePath: "visible/prior.pdf" };
beforeEach(() => {
  vi.resetAllMocks();
  mocks.list.mockResolvedValue([pending, prior]);
  mocks.download.mockResolvedValue(bytes);
  mocks.extract.mockResolvedValue({ text: "complete synthetic report" });
  mocks.parse.mockReturnValue({ statementMonth: "2026-01" });
});
it("compares only session-visible source paths and returns no report content", async () => {
  const result = await listStatementReview();
  expect(result[0].label).toBe("Already imported");
  expect(result[0].statement.statementMonth).toBe("2026-01");
  expect(mocks.download.mock.calls.flat()).toEqual(["visible/pending.pdf", "visible/prior.pdf"]);
  expect(JSON.stringify(result)).not.toContain("complete synthetic report");
});
it("does not read another owner's baseline", async () => {
  mocks.list.mockResolvedValue([pending, { ...prior, userId: "other" }]);
  expect((await listStatementReview())[0].label).toBe("New statement");
  expect(mocks.download).toHaveBeenCalledTimes(1);
});
it("keeps corrupt incoming files in review without extraction", async () => {
  mocks.download.mockResolvedValue(new Uint8Array([1]));
  expect((await listStatementReview())[0].label).toBe("Needs review");
  expect(mocks.extract).not.toHaveBeenCalled();
});
it("keeps changed content visible", async () => {
  mocks.extract.mockResolvedValueOnce({ text: "changed synthetic identity" }).mockResolvedValueOnce({ text: "original synthetic identity" });
  expect((await listStatementReview())[0].label).toBe("Possible correction");
});
it("avoids PDF reads when nothing is pending", async () => {
  mocks.list.mockResolvedValue([prior]);
  expect(await listStatementReview()).toEqual([]);
  expect(mocks.download).not.toHaveBeenCalled();
});
