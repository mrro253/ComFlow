import { describe, expect, it } from "vitest";
import { statementWorklists, chargebackKey, chargebacksNeedingReview, connectionsNeedingAttention } from "../attention";
import type { StatementRecord, CarrierTransactionRecord } from "@/lib/repositories/statementRepository";
import type { CarrierConnectionRecord } from "@/lib/repositories/carrierConnectionRepository";
const statement = (changes: Partial<StatementRecord> = {}) => ({ id: "imported", carrier: "Ultimate Health Plans", userId: null, statementMonth: "2026-03", fileHash: "a".repeat(64), status: "imported", supersededAt: null, ...changes } as StatementRecord);
const entry = { id: "entry", statementId: "statement", amountCents: -10000, effectiveDate: "2026-03-01", commissionType: "CHARGEBACK" } as CarrierTransactionRecord;
describe("attention-only worklists", () => {
  it("keeps completed and superseded records out of the queue without modifying them", () => {
    const rows = [statement(), statement({ id: "old", status: "superseded" }), statement({ id: "pending", status: "received", fileHash: "b".repeat(64) })];
    const result = statementWorklists(rows); expect(result.imported.map(row => row.id)).toEqual(["imported"]); expect(result.needsAttention.map(row => row.id)).toEqual(["pending"]); expect(rows[2].status).toBe("received");
  });
  it("recognizes exact imported PDF copies only within the same owner/carrier scope", () => {
    const repeat = statement({ id: "repeat", status: "received", statementMonth: null });
    expect(statementWorklists([statement(), repeat]).duplicates.get("repeat")).toBe("imported");
    expect(statementWorklists([statement(), { ...repeat, userId: "other" }]).needsAttention).toHaveLength(1);
    expect(statementWorklists([statement(), { ...repeat, fileHash: "c".repeat(64) }]).needsAttention).toHaveLength(1);
    expect(statementWorklists([statement(), { ...repeat, statementMonth: "2026-04" }]).needsAttention).toHaveLength(1);
  });
  it("does not infer duplicate workbook pairs from a Devoted PDF or from invalid hashes", () => {
    const rows = [statement({ carrier: "Devoted Health" }), statement({ id: "pair", carrier: "Devoted Health", status: "received" })];
    expect(statementWorklists(rows).needsAttention).toHaveLength(1);
    expect(statementWorklists([statement({ fileHash: "" }), statement({ id: "unknown", fileHash: "", status: "received" })]).needsAttention).toHaveLength(1);
  });
  it("preserves history and reopens a reviewed chargeback when evidence changes", () => {
    const reviewed = new Set([chargebackKey(entry)]);
    expect(chargebacksNeedingReview([entry], reviewed)).toEqual([]);
    expect(chargebacksNeedingReview([{ ...entry, amountCents: -20000 }], reviewed)).toHaveLength(1);
    expect(chargebacksNeedingReview([{ ...entry, id: "corrected" }], reviewed)).toHaveLength(1);
    expect(chargebacksNeedingReview([{ ...entry, commissionType: "COMMISSION" }], new Set())).toEqual([]);
    expect(entry.amountCents).toBe(-10000);
  });
  it("only requests help for the user's own blocked connections, not normal collection work", () => {
    const connection = { userId: "owner", status: "needs_attention", syncRequestedAt: null, lastError: "Verification needed" } as CarrierConnectionRecord;
    expect(connectionsNeedingAttention([connection], "owner")).toHaveLength(1);
    expect(connectionsNeedingAttention([connection], "other")).toEqual([]);
    expect(connectionsNeedingAttention([{ ...connection, lastError: "Sync running. Reading statements" }], "owner")).toEqual([]);
    expect(connectionsNeedingAttention([{ ...connection, syncRequestedAt: "2026-10-23" }], "owner")).toEqual([]);
    expect(connectionsNeedingAttention([{ ...connection, status: "active" }, { ...connection, status: "pending" }, { ...connection, status: "disabled" }], "owner")).toEqual([]);
  });
});
