import { formatCents } from "@/lib/carriers/money";
import { statementBreakdown } from "@/lib/reporting/statementBreakdown";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function StatementTotalBreakdown({ totalCents, previousBalanceCents }: {
  totalCents: number; previousBalanceCents: number;
}) {
  const summary = statementBreakdown(totalCents, previousBalanceCents);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Statement total breakdown</CardTitle>
        <CardDescription>Amounts reported on this statement.</CardDescription>
      </CardHeader>
      <CardContent>
        <dl className="grid gap-3 text-sm">
          <div className="flex items-start justify-between gap-4">
            <dt>Commission entries this month</dt>
            <dd className="shrink-0 font-medium tabular-nums">{formatCents(summary.commissionEntriesCents)}</dd>
          </div>
          <div className="flex items-start justify-between gap-4">
            <dt>{summary.previousBalanceLabel}</dt>
            <dd className="shrink-0 font-medium tabular-nums">{previousBalanceCents > 0 ? "+" : ""}{formatCents(previousBalanceCents)}</dd>
          </div>
          <div className="flex items-start justify-between gap-4 border-t pt-3 font-semibold">
            <dt>Statement total</dt>
            <dd className="shrink-0 tabular-nums">{formatCents(totalCents)}</dd>
          </div>
        </dl>
        {previousBalanceCents === 0 && <p className="mt-3 text-xs text-muted-foreground">No amount was added or deducted from a previous statement.</p>}
        <p className="mt-3 text-xs text-muted-foreground">This is the carrier&apos;s statement total. Bank deposits have not been verified.</p>
      </CardContent>
    </Card>
  );
}
