import { describe, expect, it } from "vitest";
import {
  buildCollectiveReport,
  collectiveReportCsv,
  monthsInRange,
  type ReportPayment,
} from "@/lib/reporting/collectiveReport";

const row = (overrides: Partial<ReportPayment> = {}): ReportPayment => ({
  statementMonth: "2026-09",
  carrier: "ultimate",
  memberId: "UL1",
  commissionType: "COMMISSION",
  amountCents: 10000,
  writingAgentName: "SAMPLE, PAT",
  creditedTo: "Pat Sample",
  ...overrides,
});

describe("monthsInRange", () => {
  const rows = [row({ statementMonth: "2026-08" }), row({ statementMonth: "2026-09" }), row({ statementMonth: "2026-10" })];

  it("keeps every month when the range is open", () => {
    expect(monthsInRange(rows, null, null)).toHaveLength(3);
  });

  it("filters inclusive bounds", () => {
    expect(monthsInRange(rows, "2026-09", "2026-09").map((r) => r.statementMonth)).toEqual(["2026-09"]);
    expect(monthsInRange(rows, "2026-09", null).map((r) => r.statementMonth)).toEqual(["2026-09", "2026-10"]);
  });
});

describe("buildCollectiveReport", () => {
  it("totals payments and groups by category", () => {
    const report = buildCollectiveReport([
      row(),
      row({ memberId: "UL2", commissionType: "CHARGEBACK", amountCents: -2000 }),
      row({ statementMonth: "2026-08", memberId: "UL3", amountCents: 5000 }),
    ]);
    expect(report.paymentCount).toBe(3);
    expect(report.totalCents).toBe(13000);
    expect(report.byCategory).toEqual([
      { type: "COMMISSION", cents: 15000, count: 2 },
      { type: "CHARGEBACK", cents: -2000, count: 1 },
    ]);
  });

  it("honors the month range", () => {
    const report = buildCollectiveReport(
      [row(), row({ statementMonth: "2026-08", amountCents: 1 })],
      "2026-09",
      "2026-09"
    );
    expect(report.paymentCount).toBe(1);
    expect(report.totalCents).toBe(10000);
  });
});

describe("collectiveReportCsv", () => {
  it("writes a header and one row per payment, quoting commas", () => {
    const csv = collectiveReportCsv(
      buildCollectiveReport([row({ writingAgentName: "SAMPLE, PAT", creditedTo: "Pat, Jr" })])
    );
    expect(csv.split("\n")[0]).toBe("Month,Carrier,Member ID,Category,Amount,Writing agent,Credited to");
    expect(csv).toContain("2026-09,ultimate,UL1,COMMISSION,$100.00,\"SAMPLE, PAT\",\"Pat, Jr\"");
  });
});
