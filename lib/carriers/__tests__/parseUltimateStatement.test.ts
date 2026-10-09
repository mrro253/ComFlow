import { describe, expect, it } from "vitest";
import { sha256 } from "@/lib/carriers/digest";
import { formatCents, parseMoneyToCents } from "@/lib/carriers/money";
import { parseUltimateText } from "@/lib/carriers/ultimate/parseUltimateStatement";
import { SOURCE_HASH, statementText } from "@/lib/carriers/__fixtures__/ultimateText";

describe("parseMoneyToCents", () => {
  it("keeps negative signs, parentheses, and exact cents", () => {
    expect(parseMoneyToCents("(1,234.56)")).toBe(-123456);
    expect(parseMoneyToCents("-28.92")).toBe(-2892);
    expect(parseMoneyToCents("-")).toBe(0);
    expect(parseMoneyToCents("0.01")).toBe(1);
  });

  it("rejects malformed amounts", () => {
    expect(() => parseMoneyToCents("12,34.56")).toThrow(/Invalid/);
    expect(() => parseMoneyToCents("1.5")).toThrow(/Invalid/);
  });

  it("formats cents without floating point", () => {
    expect(formatCents(123456)).toBe("$1,234.56");
    expect(formatCents(-2892)).toBe("-$28.92");
    expect(formatCents(5)).toBe("$0.05");
  });
});

describe("parseUltimateText", () => {
  it("reconciles commissions and signed chargebacks separately from carried balances", () => {
    const parsed = parseUltimateText(
      statementText({
        month: "March 2026",
        prefix: "Agent (10.00)$ BALANCE REMAINING BALANCE\n(10.00)$ BALANCE Total",
        rows:
          "UL000000101/01/2026 Agent 100.00$ COMMISSIONMAPD\n" +
          "UL000000201/01/2026 Agent (20.00)$ CHARGEBACKMAPD\n" +
          "UL000000301/01/2026 Agent -$ TERM",
        totals: "100.00$ COMMISSION Total\n(20.00)$ CHARGEBACK Total\n-$ TERM Total",
        grand: "70.00",
      }),
      SOURCE_HASH
    );
    expect(parsed.transactionTotalCents).toBe(8000);
    expect(parsed.carriedBalanceCents).toBe(-1000);
    expect(parsed.statementTotalCents).toBe(7000);
    expect(parsed.transactions[1].amountCents).toBe(-2000);
  });

  it("parses multiline amounts and subtotals", () => {
    const parsed = parseUltimateText(
      statementText({
        rows: "UL0000001\n01/01/2026 Agent 28.92$\nRENEWAL",
        totals: "28.92$\nRENEWAL Total",
      }),
      SOURCE_HASH
    );
    expect(parsed.statementMonth).toBe("2026-09");
    expect(parsed.transactions[0].effectiveDate).toBe("01/01/2026");
    expect(parsed.transactions[0].effectiveDateIso).toBe("2026-01-01");
  });

  it.each([
    ["a total that does not reconcile", { grand: "30.00" }, /Statement total/],
    ["a subtotal that does not match rows", { totals: "30.00$ RENEWAL Total", grand: "30.00" }, /subtotal/],
    ["a missing effective date", { rows: "UL0000001 Agent 28.92$ RENEWAL" }, /date missing/],
    ["an impossible calendar date", { rows: "UL000000102/31/2026 Agent 28.92$ RENEWAL" }, /invalid effective date/],
    ["an unknown transaction type", { rows: "UL000000101/01/2026 Agent 28.92$ UNKNOWN" }, /ambiguous/],
    [
      "a positive chargeback",
      { rows: "UL000000101/01/2026 Agent 28.92$ CHARGEBACK", totals: "28.92$ CHARGEBACK Total" },
      /positive chargeback/,
    ],
  ])("blocks %s", (_label, overrides, message) => {
    expect(() => parseUltimateText(statementText(overrides), SOURCE_HASH)).toThrow(message);
  });

  it("rejects non-Ultimate text and invalid source hashes", () => {
    expect(() => parseUltimateText("Some other carrier", SOURCE_HASH)).toThrow(/Unrecognized/);
    expect(() => parseUltimateText(statementText(), "not-a-hash")).toThrow(/SHA-256/);
  });

  it("keeps distinct occurrence keys for identical rows in one statement", () => {
    const parsed = parseUltimateText(
      statementText({
        rows: "UL000000101/01/2026 Agent 28.92$ RENEWAL\nUL000000101/01/2026 Agent 28.92$ RENEWAL",
        totals: "57.84$ RENEWAL Total",
        grand: "57.84",
      }),
      SOURCE_HASH
    );
    expect(parsed.transactions[0].transactionKey).not.toBe(parsed.transactions[1].transactionKey);
    expect(parsed.transactions.map((row) => row.occurrence)).toEqual([1, 2]);
  });

  it("derives a transaction key that depends on the source file", () => {
    const a = parseUltimateText(statementText(), SOURCE_HASH).transactions[0];
    const b = parseUltimateText(statementText(), sha256("different PDF")).transactions[0];
    expect(a.transactionKey).not.toBe(b.transactionKey);
    expect(a.transactionKey).toMatch(/^[a-f0-9]{64}$/);
  });
});
