import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadPaymentDetails } from "../paymentDetailsService";
import { buildSampleStatementLines } from "@/lib/carriers/sampleStatement";
import { parseUltimateText, ULTIMATE_CARRIER } from "@/lib/carriers/ultimate/parseUltimateStatement";
import { readUhcStatement,UHC_CARRIER } from "@/lib/carriers/uhc/parseUhcStatement";
import { uhcText } from "@/lib/carriers/__tests__/fixtures/uhcStatement";
import { parseDevotedPair,DEVOTED } from "@/lib/carriers/devoted/parseDevotedPair";
import { syntheticPair } from "@/lib/carriers/devoted/__fixtures__/syntheticPair";

const mocks = vi.hoisted(() => ({ visible: vi.fn(), statement: vi.fn(), download: vi.fn(), text: vi.fn(), details: vi.fn(), statementText:vi.fn(), devotedSource:vi.fn(),devotedParse:vi.fn() }));
vi.mock("@/lib/repositories/devotedRepository",()=>({loadSavedDevotedPair:mocks.devotedSource}));
vi.mock("@/lib/services/devotedPairService",()=>({parseDevotedBytes:mocks.devotedParse}));
vi.mock("@/lib/pdf/extractStatementPdf",()=>({extractStatementPdf:mocks.statementText}));
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
  it("keeps Devoted details scoped to visible entries and rejects changed pair context",async()=>{
    const pair=parseDevotedPair(syntheticPair()),tx=pair.statement.transactions[0];
    const source={storage_path:"agency/devoted/source.pdf",file_hash:pair.statement.sourceHash,carrier:DEVOTED,source_pair_hash:pair.pairHash,statement_pay_date:pair.payDate,devoted_payee_hash:pair.payeeHash};
    mocks.statement.mockResolvedValue(source);mocks.devotedSource.mockResolvedValue({pdf:Buffer.from("synthetic"),workbook:Buffer.from("synthetic")});mocks.devotedParse.mockResolvedValue(pair);
    const row={...visible,transaction_key:tx.transactionKey,carrier_member_id:tx.memberId,effective_date:tx.effectiveDateIso,amount_cents:tx.amountCents,commission_type:tx.type};
    mocks.visible.mockResolvedValue([row]);const details=await loadPaymentDetails(["visible-id","hidden-id"],"agency-id");
    expect([...details.keys()]).toEqual(["visible-id"]);expect(details.get("visible-id")?.clientName).toBe("SAM EXAMPLE");
    for(const change of [{source_pair_hash:"changed"},{statement_pay_date:"2026-01-01"},{devoted_payee_hash:"changed"},{file_hash:"changed"}]){
      mocks.statement.mockResolvedValue({...source,...change});expect((await loadPaymentDetails(["visible-id"],"agency-id")).size).toBe(0);
    }
  });
  it("enriches only the RLS-visible UHC entry from a verified source",async()=>{
    const text=uhcText(),tx=readUhcStatement(text,hash).statement.transactions[0];
    const row={...visible,transaction_key:tx.transactionKey,carrier_member_id:tx.memberId,effective_date:tx.effectiveDateIso,amount_cents:tx.amountCents,commission_type:tx.type};
    mocks.visible.mockResolvedValue([row]);mocks.statement.mockResolvedValue({storage_path:"agency/uhc.pdf",file_hash:hash,carrier:UHC_CARRIER});
    mocks.statementText.mockResolvedValue({text,sha256:hash});
    const result=await loadPaymentDetails(["visible-id","hidden-id"],"agency-id");
    expect([...result.keys()]).toEqual(["visible-id"]);expect(result.get("visible-id")?.clientName).toBe("SYNTHETIC CLIENT 1");
    expect(mocks.details).not.toHaveBeenCalled();
    for(const override of [{amount_cents:0},{carrier_member_id:"different"},{transaction_key:"different"}]){
      mocks.visible.mockResolvedValue([{...row,...override}]);expect((await loadPaymentDetails(["visible-id"],"agency-id")).size).toBe(0);
    }
    mocks.statementText.mockResolvedValue({text,sha256:"b".repeat(64)});expect((await loadPaymentDetails(["visible-id"],"agency-id")).size).toBe(0);
  });
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
