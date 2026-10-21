import { describe, expect, it } from "vitest";
import { carrierMonthlySeries } from "../carrierMonthlySeries";
import { monthlyPaidSeries } from "../carrierMetrics";
const tx = (carrier: string, statementMonth: string, amountCents: number) => ({ carrier, statementMonth, amountCents, userId: "synthetic", commissionType: "RENEWAL" });
describe("monthly carrier contributions", () => {
  it("keeps exact month totals, signed carrier contributions and chronological order", () => {
    const entries = [tx("Carrier B", "2026-02", 2000), tx("Carrier A", "2026-01", 1111), tx("Carrier A", "2026-02", -700), tx("Carrier C", "2026-02", 99), tx("Carrier B", "2026-02", 1)];
    const result = carrierMonthlySeries(entries);
    expect(result.carriers.map(c => c.name)).toEqual(["Carrier A", "Carrier B", "Carrier C"]);
    expect(result.data.map(p => ({ month: p.month, total: p.totalCents / 100 }))).toEqual(monthlyPaidSeries(entries));
    expect(result.data[1].values).toEqual({ carrier0: -700, carrier1: 2001, carrier2: 99 });
    expect(result.data[1].totalCents).toBe(1400);
    expect(result.data[0].entryCounts).toEqual({ carrier0: 1, carrier1: 0, carrier2: 0 });
  });
  it("distinguishes no imported entries from entries that net to zero", () => {
    const result = carrierMonthlySeries([tx("A", "2026-01", 5), tx("A", "2026-01", -5), tx("B", "2026-02", 10)]);
    expect(result.data[0].values).toEqual({ carrier0: 0, carrier1: 0 });
    expect(result.data[0].entryCounts).toEqual({ carrier0: 2, carrier1: 0 });
  });
  it("uses generated keys for carrier names containing punctuation or object property names", () => {
    const result = carrierMonthlySeries([tx("A.B / C", "2026-01", 123), tx("__proto__", "2026-01", 4)]);
    expect(Object.values(result.data[0].values).reduce((a,b) => a+b, 0)).toBe(127);
    expect(Object.keys(result.data[0].values)).toEqual(["carrier0", "carrier1"]);
  });
  it("handles an empty visible scope", () => { expect(carrierMonthlySeries([])).toEqual({ carriers: [], data: [] }); });
});
