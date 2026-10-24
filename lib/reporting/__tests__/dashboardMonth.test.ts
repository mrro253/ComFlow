import { describe, expect, it } from "vitest";
import { selectDashboardMonth, selectDashboardYear, selectDashboardQuarter } from "@/lib/reporting/dashboardMonth";

describe("dashboard month selection", () => {
  it("defaults to the latest visible month and offers distinct months newest first", () => {
    expect(selectDashboardMonth(["2025-12", "2026-01", "2025-12"], undefined)).toEqual({
      months: ["2026-01", "2025-12"], month: "2026-01", unavailable: false,
    });
  });
  it("keeps an explicitly selected older visible month", () => {
    expect(selectDashboardMonth(["2026-09", "2026-02"], "2026-02").month).toBe("2026-02");
  });
  it.each(["2026-12", "2026-13", "", ["2026-09", "2026-02"]])("falls back safely for an unavailable or malformed request %j", (request) => {
    expect(selectDashboardMonth(["2026-09", "2026-02"], request)).toMatchObject({month: "2026-09", unavailable: true});
  });
  it("does not expose months outside the caller's visible data", () => {
    expect(selectDashboardMonth(["2026-02"], "2026-09")).toEqual({months: ["2026-02"], month: "2026-02", unavailable: true});
  });
  it("handles an empty ledger without inventing a month", () => {
    expect(selectDashboardMonth([], undefined)).toEqual({months: [], month: null, unavailable: false});
  });
});

describe("annual dashboard selection", () => {
  it("offers only years in valid visible statement months, newest first", () => {
    expect(selectDashboardYear(["2025-12", "2026-02", "2026-02", "2026-13", "bad"], undefined)).toEqual({ years: ["2026", "2025"], year: "2026", unavailable: false, monthsOnFile: 1 });
  });
  it("selects an older year and counts distinct months without inventing missing months", () => {
    expect(selectDashboardYear(["2025-01", "2025-12", "2025-12", "2026-01"], "2025")).toMatchObject({ year: "2025", monthsOnFile: 2, unavailable: false });
  });
  it.each(["2024", "all", "", ["2025", "2026"]])("falls back for unavailable or malformed year %j", requested => {
    expect(selectDashboardYear(["2026-03"], requested)).toMatchObject({ year: "2026", unavailable: true });
  });
  it("does not invent a year for an empty ledger", () => {
    expect(selectDashboardYear([], undefined)).toEqual({ years: [], year: null, unavailable: false, monthsOnFile: 0 });
  });
});

describe("quarterly dashboard selection", () => {
  const months = ["2025-12", "2026-01", "2026-03", "2026-04", "2026-06", "2026-07", "2026-09", "2026-10", "2026-12"];
  it.each([["1", "01", "03"], ["2", "04", "06"], ["3", "07", "09"], ["4", "10", "12"]])("bounds Q%s without adjacent-year or quarter leakage", (quarter, first, last) => {
    expect(selectDashboardQuarter(months, "2026", quarter)).toMatchObject({ quarter: Number(quarter), start: `2026-${first}`, end: `2026-${last}`, monthsOnFile: 2, unavailable: false });
  });
  it("defaults to the latest visible quarter of the selected year", () => {
    expect(selectDashboardQuarter(months, "2025", undefined)).toMatchObject({ quarter: 4, monthsOnFile: 1 });
    expect(selectDashboardQuarter(["2026-04"], "2026", undefined).quarter).toBe(2);
  });
  it("permits a quarter with no imported months without inventing records", () => {
    expect(selectDashboardQuarter(["2026-01"], "2026", "3")).toMatchObject({ quarter: 3, monthsOnFile: 0, unavailable: false });
  });
  it.each(["0", "5", "Q1", ["1", "2"]])("rejects malformed quarter %j", requested => {
    expect(selectDashboardQuarter(["2026-04"], "2026", requested)).toMatchObject({ quarter: 2, unavailable: true });
  });
});
