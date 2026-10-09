import { describe, expect, it } from "vitest";
import { sha256 } from "@/lib/carriers/digest";
import {
  planStatementImport,
  type ExistingTransaction,
} from "@/lib/carriers/planStatementImport";
import type { ParsedTransaction } from "@/lib/carriers/types";
import { parseUltimateText } from "@/lib/carriers/ultimate/parseUltimateStatement";
import { SOURCE_HASH, statementText } from "@/lib/carriers/__fixtures__/ultimateText";

function ledgerRow(row: ParsedTransaction, id = "tx-1"): ExistingTransaction {
  return {
    id,
    transactionKey: row.transactionKey,
    carrier: row.carrier,
    statementMonth: row.statementMonth,
    memberId: row.memberId,
    type: row.type,
    amountCents: row.amountCents,
  };
}

describe("planStatementImport", () => {
  it("proposes new rows and skips zero-dollar events", () => {
    const parsed = parseUltimateText(
      statementText({
        rows:
          "UL000000101/01/2026 Agent 100.00$ COMMISSIONMAPD\n" +
          "UL000000201/01/2026 Agent (20.00)$ CHARGEBACKMAPD\n" +
          "UL000000301/01/2026 Agent -$ TERM",
        totals: "100.00$ COMMISSION Total\n(20.00)$ CHARGEBACK Total\n-$ TERM Total",
        grand: "80.00",
      }),
      SOURCE_HASH
    );
    const [plan] = planStatementImport([parsed], []);
    expect(plan.rows.map((row) => row.disposition)).toEqual(["new", "new", "informational"]);
    expect(
      plan.rows.filter((row) => row.disposition === "new").reduce((sum, row) => sum + row.transaction.amountCents, 0)
    ).toBe(8000);
  });

  it("imports a copied PDF once and recognizes already-imported rows", () => {
    const parsed = parseUltimateText(statementText(), SOURCE_HASH);
    const plans = planStatementImport([parsed, { ...parsed }], [ledgerRow(parsed.transactions[0])]);
    expect(plans[0].rows[0].disposition).toBe("already-imported");
    expect(plans[0].rows[0].matchedExistingId).toBe("tx-1");
    expect(plans[1].duplicateFile).toBe(true);
    expect(plans[1].rows).toHaveLength(0);
  });

  it("holds rows whose key matches but whose content changed", () => {
    const parsed = parseUltimateText(statementText(), SOURCE_HASH);
    const tampered = { ...ledgerRow(parsed.transactions[0]), amountCents: 1 };
    expect(planStatementImport([parsed], [tampered])[0].rows[0].disposition).toBe("review");
  });

  it("does not silently merge economically identical rows from different PDFs", () => {
    const one = parseUltimateText(statementText(), SOURCE_HASH);
    const two = parseUltimateText(statementText(), sha256("different PDF"));
    const plans = planStatementImport([one, two], []);
    expect(plans[0].rows[0].disposition).toBe("review");
    expect(plans[1].rows[0].disposition).toBe("review");
  });

  it("holds rows that match the ledger economically but lack exact source proof", () => {
    const parsed = parseUltimateText(statementText(), SOURCE_HASH);
    const other = parseUltimateText(statementText(), sha256("another earlier PDF")).transactions[0];
    const [plan] = planStatementImport([parsed], [ledgerRow(other)]);
    expect(plan.rows[0].disposition).toBe("review");
  });

  it("keeps identical rows within one statement as separate new rows", () => {
    const parsed = parseUltimateText(
      statementText({
        rows: "UL000000101/01/2026 Agent 28.92$ RENEWAL\nUL000000101/01/2026 Agent 28.92$ RENEWAL",
        totals: "57.84$ RENEWAL Total",
        grand: "57.84",
      }),
      SOURCE_HASH
    );
    const [plan] = planStatementImport([parsed], []);
    expect(plan.rows.map((row) => row.disposition)).toEqual(["new", "new"]);
  });
});
