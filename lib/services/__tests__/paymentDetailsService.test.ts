import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadPaymentDetails } from "../paymentDetailsService";
import { buildSampleStatementLines } from "@/lib/carriers/sampleStatement";
import { parseUltimateText, ULTIMATE_CARRIER } from "@/lib/carriers/ultimate/parseUltimateStatement";

const mocks = vi.hoisted(() => ({ visible: vi.fn(), statement: vi.fn(), download: vi.fn(), text: vi.fn(), details: vi.fn() }));
vi.mock("@/lib/repositories/paymentDetailsRepository", () => ({ listVisiblePaymentSources: mocks.visible, getPaymentStatementSource: mocks.statement }));
vi.mock("@/lib/repositories/statementRepository", () => ({ downloadStatementPdf: mocks.download }));
vi.mock("@/lib/pdf/extractPdfText", () => ({ extractPdfText: mocks.text }));
vi.mock("@/lib/pdf/extractUltimateDetails", () => ({ extractUltimateDetails: mocks.details }));
const hash = "a".repeat(64);
const text = buildSampleStatementLines().join("\n");
const parsed = parseUltimateText(text, hash);
const transaction = parsed.transactions[0];
const visible = { id: "visible-id", statement_id: "statement-id", transaction_key: transaction.transactionKey,
  carrier_member_id: transaction.memberId, effective_date: transaction.effectiveDateIso,
  amount_cents: transaction.amountCents, commission_type: transaction.type };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.visible.mockResolvedValue([visible]);
  mocks.statement.mockResolvedValue({ storage_path: "agency/hash.pdf", file_hash: hash, original_filename: "synthetic.pdf", carrier: ULTIMATE_CARRIER });
  mocks.download.mockResolvedValue(Buffer.from("%PDF-test"));
  mocks.text.mockResolvedValue({ text, sha256: hash });
  mocks.details.mockResolvedValue(parsed.transactions.map((tx) => ({ clientName: "Synthetic Client", fields: [], memberId: tx.memberId,
    effectiveDate: tx.effectiveDate, writingAgent: tx.writingAgent, amountCents: tx.amountCents, category: tx.type })));
});

describe("payment source access and integrity", () => {
  it("returns only the RLS-visible payment, never other clients in the same PDF", async () => {
    const result = await loadPaymentDetails(["visible-id", "hidden-id"], "agency-id");
    expect(mocks.visible).toHaveBeenCalledWith(["visible-id", "hidden-id"], "agency-id");
    expect(mocks.statement).toHaveBeenCalledWith("statement-id", "agency-id");
    expect([...result.keys()]).toEqual(["visible-id"]);
  });
  it("never downloads a PDF when the user cannot read a payment", async () => {
    mocks.visible.mockResolvedValue([]);
    expect((await loadPaymentDetails(["hidden-id"], "agency-id")).size).toBe(0);
    expect(mocks.statement).not.toHaveBeenCalled(); expect(mocks.download).not.toHaveBeenCalled();
  });
  it("rejects an altered source PDF", async () => {
    mocks.text.mockResolvedValue({ text, sha256: "b".repeat(64) });
    expect((await loadPaymentDetails(["visible-id"], "agency-id")).size).toBe(0);
    expect(mocks.details).not.toHaveBeenCalled();
  });
  it("rejects mismatched ledger values and source keys", async () => {
    for (const override of [{ amount_cents: 1 }, { carrier_member_id: "UL9000099" }, { transaction_key: "wrong" }, { effective_date: "2026-02-01" }, { commission_type: "RENEWAL" }]) {
      mocks.visible.mockResolvedValue([{ ...visible, ...override }]);
      expect((await loadPaymentDetails(["visible-id"], "agency-id")).size).toBe(0);
    }
  });
  it("fails safely for missing files or unsupported layouts without leaking errors", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.details.mockRejectedValue(new Error("Synthetic private data"));
    expect((await loadPaymentDetails(["visible-id"], "agency-id")).size).toBe(0);
    expect(log).not.toHaveBeenCalled(); log.mockRestore();
  });
  it("downloads a statement once for multiple visible payments", async () => {
    mocks.visible.mockResolvedValue([visible, { ...visible, id: "second-id" }]);
    expect((await loadPaymentDetails(["visible-id", "second-id"], "agency-id")).size).toBe(2);
    expect(mocks.download).toHaveBeenCalledTimes(1);
  });
});