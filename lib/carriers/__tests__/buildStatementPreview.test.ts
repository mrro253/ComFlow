import { describe, expect, it } from "vitest";
import { buildStatementPreview, toImportRows } from "@/lib/carriers/buildStatementPreview";
import {
  writingAgentAliasesFor,
  type WritingAgentOwner,
} from "@/lib/carriers/classifyWritingAgent";
import { sha256 } from "@/lib/carriers/digest";
import { parseUltimateText } from "@/lib/carriers/ultimate/parseUltimateStatement";
import { SOURCE_HASH } from "@/lib/carriers/__fixtures__/ultimateText";

const CAREER: WritingAgentOwner = {
  userId: "user-career",
  agentType: "career",
  productionEntityId: "entity-agency",
  entityType: "agency",
};
const aliases = new Map<string, readonly WritingAgentOwner[]>(
  writingAgentAliasesFor("Pat", "Sample").map((a) => [a, [CAREER]])
);

// Two rows: one written by a known agent (prefix layout verified), one unknown.
const TEXT = [
  "Ultimate Health Plans",
  "Commissions and Renewals Statement",
  "September 2026",
  "UL000000101/01/2026SAMPLE, PATMCCW123W123PAYEE100.00$ COMMISSION",
  "UL000000201/01/2026STRANGER, ANNMCCW123W123PAYEE(20.00)$ CHARGEBACK",
  "100.00$ COMMISSION Total",
  "(20.00)$ CHARGEBACK Total",
  "W123 Total80.00$",
].join("\n");

describe("buildStatementPreview", () => {
  const statement = parseUltimateText(TEXT, SOURCE_HASH);

  it("assigns known writing agents and leaves strangers unassigned without blocking", () => {
    const preview = buildStatementPreview(statement, aliases, []);
    expect(preview.counts.new).toBe(2);
    expect(preview.newTotalCents).toBe(8000);
    expect(preview.unassignedNewCount).toBe(1);
    expect(preview.canImport).toBe(true);
    expect(preview.rows[0].classification.status).toBe("assigned");
    expect(preview.rows[1].classification.status).toBe("review");
  });

  it("assigns every row of an independent agent's own statement to them", () => {
    const independent: WritingAgentOwner = {
      userId: "user-indie",
      agentType: "independent",
      productionEntityId: null,
      entityType: null,
    };
    const preview = buildStatementPreview(statement, new Map(), [], independent);
    expect(preview.unassignedNewCount).toBe(0);
    expect(toImportRows(preview).every((row) => row.user_id === "user-indie")).toBe(true);
  });

  it("maps new rows to the import payload, nulling unassigned users", () => {
    const rows = toImportRows(buildStatementPreview(statement, aliases, []));
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      user_id: "user-career",
      production_entity_id: "entity-agency",
      effective_date: "2026-01-01",
      amount_cents: 10000,
      commission_type: "COMMISSION",
    });
    expect(rows[1]).toMatchObject({ user_id: null, production_entity_id: null, amount_cents: -2000 });
  });

  it("does not re-import rows that are already in the ledger", () => {
    const existing = statement.transactions.map((tx, index) => ({
      id: `tx-${index}`,
      transactionKey: tx.transactionKey,
      carrier: tx.carrier,
      statementMonth: tx.statementMonth,
      memberId: tx.memberId,
      type: tx.type,
      amountCents: tx.amountCents,
    }));
    const preview = buildStatementPreview(statement, aliases, existing);
    expect(preview.counts["already-imported"]).toBe(2);
    expect(toImportRows(preview)).toHaveLength(0);
    expect(preview.canImport).toBe(true);
  });

  it("blocks the import when a row looks like a duplicate from another source", () => {
    const earlier = parseUltimateText(TEXT, sha256("an earlier PDF of the same data"));
    const existing = earlier.transactions.map((tx, index) => ({
      id: `old-${index}`,
      transactionKey: tx.transactionKey,
      carrier: tx.carrier,
      statementMonth: tx.statementMonth,
      memberId: tx.memberId,
      type: tx.type,
      amountCents: tx.amountCents,
    }));
    const preview = buildStatementPreview(statement, aliases, existing);
    expect(preview.counts.review).toBe(2);
    expect(preview.canImport).toBe(false);
    expect(preview.blockers[0]).toMatch(/duplicates/);
  });

  it("treats a same-name, same-payments statement as a duplicate to bring in once", () => {
    const preview = buildStatementPreview(statement, aliases, [], null, {
      kind: "duplicate",
      of: { id: "earlier", filename: "ultimate-sept.pdf" },
    });
    expect(preview.counts["already-imported"]).toBe(2);
    expect(preview.counts.new).toBe(0);
    expect(toImportRows(preview)).toHaveLength(0);
    expect(preview.canImport).toBe(true);
  });

  it("carries the replaced statements for a corrected version", () => {
    const correction = {
      kind: "supersede" as const,
      replaces: [{ id: "old", filename: "ultimate-sept.pdf" }],
    };
    const preview = buildStatementPreview(statement, aliases, [], null, correction);
    expect(preview.correction).toEqual(correction);
    expect(preview.counts.new).toBe(2);
  });

  it("imports captive agents' rows credited to the principal with the writer recorded", () => {
    const credited: WritingAgentOwner = { ...CAREER, userId: "user-principal", writingUserId: "user-captive" };
    const index = new Map<string, readonly WritingAgentOwner[]>(
      writingAgentAliasesFor("Pat", "Sample").map((a) => [a, [credited]])
    );
    const rows = toImportRows(buildStatementPreview(statement, index, []));
    expect(rows[0]).toMatchObject({ user_id: "user-principal", writing_user_id: "user-captive" });
    expect(rows[1]).toMatchObject({ user_id: null, writing_user_id: null });
  });
});
