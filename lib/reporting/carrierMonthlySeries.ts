import { monthLabel, type MetricTransaction } from "./carrierMetrics";

export interface CarrierSeries { key: string; name: string }
export interface CarrierMonthlyPoint {
  month: string;
  statementMonth: string;
  totalCents: number;
  values: Record<string, number>;
  entryCounts: Record<string, number>;
}

/** Uses only the session-visible entries supplied by the dashboard. All sums stay in cents. */
export function carrierMonthlySeries(transactions: readonly (MetricTransaction & { carrier: string })[]) {
  const carriers: CarrierSeries[] = [...new Set(transactions.map(tx => tx.carrier))].sort()
    .map((name, index) => ({ name, key: `carrier${index}` }));
  const keys = new Map(carriers.map(carrier => [carrier.name, carrier.key]));
  const months = new Map<string, CarrierMonthlyPoint>();
  for (const tx of transactions) {
    const key = keys.get(tx.carrier)!;
    const point = months.get(tx.statementMonth) ?? {
      month: monthLabel(tx.statementMonth), statementMonth: tx.statementMonth, totalCents: 0,
      values: Object.fromEntries(carriers.map(c => [c.key, 0])),
      entryCounts: Object.fromEntries(carriers.map(c => [c.key, 0])),
    };
    point.values[key] += tx.amountCents;
    point.entryCounts[key]++;
    point.totalCents += tx.amountCents;
    months.set(tx.statementMonth, point);
  }
  return { carriers, data: [...months.values()].sort((a, b) => a.statementMonth.localeCompare(b.statementMonth)) };
}
