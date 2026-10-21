import { describe, expect, it } from "vitest";
import { selectDashboardMonth } from "@/lib/reporting/dashboardMonth";

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
