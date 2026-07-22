"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";
import type { MonthlyPoint } from "@/lib/reporting/metrics";

/** Reusable monthly bar chart card - used for both the Monthly Sales and
 *  Monthly Commissions charts on the Overview dashboard so the recharts
 *  boilerplate only lives in one place. */
export function BarChartCard({
  title,
  data,
  barColor = "hsl(var(--chart-1))",
}: {
  title: string;
  data: MonthlyPoint[];
  barColor?: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="h-72">
        {data.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            No data yet.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="hsl(var(--border))" />
              <XAxis
                dataKey="month"
                tickLine={false}
                axisLine={false}
                fontSize={12}
                stroke="hsl(var(--muted-foreground))"
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                fontSize={12}
                stroke="hsl(var(--muted-foreground))"
                tickFormatter={(value) => formatCurrency(value as number)}
                width={80}
              />
              <Tooltip
                cursor={{ fill: "hsl(var(--muted))" }}
                formatter={(value: number) => formatCurrency(value)}
                contentStyle={{
                  borderRadius: 8,
                  borderColor: "hsl(var(--border))",
                  fontSize: 12,
                }}
              />
              <Bar dataKey="total" fill={barColor} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
