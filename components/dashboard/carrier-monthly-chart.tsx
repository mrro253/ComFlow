"use client";

import { Bar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipProps } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCents } from "@/lib/carriers/money";
import type { CarrierMonthlyPoint, CarrierSeries } from "@/lib/reporting/carrierMonthlySeries";

const color = (index: number) => `hsl(var(--chart-${index % 5 + 1}))`;

function CarrierTooltip({ active, payload, carriers }: TooltipProps<number, string> & { carriers: CarrierSeries[] }) {
  const point = payload?.[0]?.payload as CarrierMonthlyPoint | undefined;
  if (!active || !point) return null;
  return (
    <div className="max-w-[min(90vw,22rem)] rounded-lg border bg-background p-3 text-sm shadow-md">
      <p className="mb-2 font-semibold">{point.month}</p>
      <dl className="grid gap-2">
        {carriers.map((carrier, index) => <div key={carrier.key} className="flex items-start justify-between gap-4">
          <dt className="flex min-w-0 items-start gap-2"><span aria-hidden className="mt-1 h-3 w-3 shrink-0 rounded-sm" style={{ backgroundColor: color(index) }} /><span className="break-words">{carrier.name}</span></dt>
          <dd className="shrink-0 tabular-nums">{point.entryCounts[carrier.key] ? formatCents(point.values[carrier.key]) : "No entries imported"}</dd>
        </div>)}
        <div className="flex justify-between gap-4 border-t pt-2 font-semibold"><dt>Month total</dt><dd className="tabular-nums">{formatCents(point.totalCents)}</dd></div>
      </dl>
    </div>
  );
}

export function CarrierMonthlyChart({ carriers, data }: { carriers: CarrierSeries[]; data: CarrierMonthlyPoint[] }) {
  return (
    <Card className="min-w-0 overflow-hidden">
      <CardHeader>
        <CardTitle>Commission totals by statement month</CardTitle>
        <CardDescription>Each color shows one carrier. Point to a month to see the amounts. Negative amounts appear below zero and reduce the month total.</CardDescription>
      </CardHeader>
      <CardContent>
        <ul aria-label="Carrier chart legend" className="mb-4 flex flex-wrap gap-x-5 gap-y-2 text-sm">
          {carriers.map((carrier, index) => <li key={carrier.key} className="flex min-w-0 items-center gap-2"><span aria-hidden className="h-3 w-3 shrink-0 rounded-sm" style={{ backgroundColor: color(index) }} /><span className="break-words">{carrier.name}</span></li>)}
        </ul>
        <div className="h-72" role="img" aria-label="Monthly commission entries split by carrier. Negative carrier totals are below zero.">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} stackOffset="sign" margin={{ top: 4, right: 8, left: 8, bottom: 0 }} accessibilityLayer>
              <CartesianGrid vertical={false} stroke="hsl(var(--border))" />
              <XAxis dataKey="month" tickLine={false} axisLine={false} fontSize={12} stroke="hsl(var(--muted-foreground))" />
              <YAxis tickLine={false} axisLine={false} fontSize={12} stroke="hsl(var(--muted-foreground))" tickFormatter={(value: number) => formatCents(value)} width={90} />
              <Tooltip cursor={{ fill: "hsl(var(--muted))" }} content={<CarrierTooltip carriers={carriers} />} />
              <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" />
              {carriers.map((carrier, index) => <Bar key={carrier.key} dataKey={`values.${carrier.key}`} name={carrier.name} stackId="carriers" fill={color(index)} isAnimationActive={false} />)}
            </BarChart>
          </ResponsiveContainer>
        </div>
        <details className="mt-4 text-sm">
          <summary className="cursor-pointer font-medium">View amounts by carrier</summary>
          <div className="mt-3 overflow-x-auto"><table className="w-full text-left text-xs"><caption className="sr-only">Monthly carrier commission amounts</caption>
            <thead><tr><th scope="col" className="p-2">Month</th>{carriers.map(c => <th scope="col" className="p-2" key={c.key}>{c.name}</th>)}<th scope="col" className="p-2">Month total</th></tr></thead>
            <tbody>{data.map(point => <tr key={point.statementMonth}><th scope="row" className="whitespace-nowrap p-2">{point.month}</th>{carriers.map(c => <td className="whitespace-nowrap p-2 tabular-nums" key={c.key}>{point.entryCounts[c.key] ? formatCents(point.values[c.key]) : "No entries imported"}</td>)}<td className="p-2 font-semibold tabular-nums">{formatCents(point.totalCents)}</td></tr>)}</tbody>
          </table></div>
        </details>
      </CardContent>
    </Card>
  );
}
