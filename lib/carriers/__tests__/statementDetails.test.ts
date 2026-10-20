import { describe, expect, it } from "vitest";
import { readUltimateDetailPage, verifiedUltimateDetails, type StatementTextItem } from "../ultimate/statementDetails";
import { parseUltimateText } from "../ultimate/parseUltimateStatement";
import { buildSampleStatementLines } from "../sampleStatement";

const labels = ["Last Name", "First Name", "MBI #", "UL ID #", "Effective Date", "Writing Agent", "UCAIN", "Payee ID", "Payee Name", "Amount", "Type", "Prior Plan", "Notes"];
function item(str: string, col: number, y: number): StatementTextItem {
  return { str, width: 20, transform: [1, 0, 0, 1, col * 100, y] };
}
function fixture() {
  return [...labels.map((label, col) => item(label, col, 700)),
    ...["EXAMPLE", "SAM", "***1234", "UL9000001", "01/01/2026", "AGENT, ALEX", "MCCW123", "W123", "DEMO PAYEE", "300.00$", "COMMISSION", "", "Synthetic note"]
      .map((value, col) => item(value, col, 650))];
}

describe("Ultimate statement row details", () => {
  it("retains all 13 printed columns, blank fields, and the client's name", () => {
    const [row] = readUltimateDetailPage(fixture());
    expect(row.clientName).toBe("SAM EXAMPLE");
    expect(row.fields).toHaveLength(13);
    expect(row.fields[2]).toEqual({ label: "MBI #", value: "***1234" });
    expect(row.fields[11].value).toBe("");
    expect(row.fields[12].value).toBe("Synthetic note");
    expect(row.amountCents).toBe(30000);
  });
  it("does not combine two clients on different lines", () => {
    const second = fixture().slice(13).map((cell) => ({ ...cell, transform: [...cell.transform.slice(0, 5), 620] }));
    second[0].str = "OTHER"; second[3].str = "UL9000002";
    const rows = readUltimateDetailPage([...fixture(), ...second]);
    expect(rows.map((row) => row.clientName)).toEqual(["SAM EXAMPLE", "SAM OTHER"]);
  });
  it("rejects missing or shifted table headings", () => {
    expect(() => readUltimateDetailPage([])).toThrow("layout");
    const cells = fixture(); cells[3].str = "Unknown";
    expect(() => readUltimateDetailPage(cells)).toThrow("columns");
    const shifted = fixture(); shifted[4].transform[4] = 0;
    expect(() => readUltimateDetailPage(shifted)).toThrow("columns");
  });
  it("keeps negative money in integer cents", () => {
    const cells = fixture(); cells[22].str = "(150.00)$";
    expect(readUltimateDetailPage(cells)[0].amountCents).toBe(-15000);
  });
  it("attaches a name only to the verified original transaction key", () => {
    const tx = parseUltimateText(buildSampleStatementLines().join("\n"), "a".repeat(64)).transactions[0];
    const details = readUltimateDetailPage(fixture());
    expect(verifiedUltimateDetails([tx], details).get(tx.transactionKey)?.clientName).toBe("SAM EXAMPLE");
    expect(() => verifiedUltimateDetails([tx], [])).toThrow("count");
    for (const field of ["memberId", "effectiveDate", "writingAgent", "category"] as const) {
      expect(() => verifiedUltimateDetails([tx], [{ ...details[0], [field]: "OTHER" }])).toThrow("identity");
    }
    expect(() => verifiedUltimateDetails([tx], [{ ...details[0], amountCents: 1 }])).toThrow("identity");
    expect(() => verifiedUltimateDetails([tx, tx], [details[0], details[0]])).toThrow("key");
  });
});