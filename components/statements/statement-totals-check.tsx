import { formatCents } from "@/lib/carriers/money";
import type { StatementTotalsCheck } from "@/lib/reporting/statementTotalsCheck";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const TOTALS_LABEL = { match: "Totals match", difference: "Difference to review", unavailable: "Check unavailable" } as const;
export function StatementTotalsCheckCard({ check, historical = false }: { check: StatementTotalsCheck; historical?: boolean }) {
  const money = (n: number | null) => n === null ? "Not available" : formatCents(n);
  return <Card>
    <CardHeader><div className="flex flex-wrap items-center justify-between gap-3"><CardTitle>Statement totals check</CardTitle><Badge variant={check.status === "match" ? "success" : check.status === "difference" ? "destructive" : "secondary"}>{TOTALS_LABEL[check.status]}</Badge></div><CardDescription>Compares the carrier total saved at import with the actual imported entries. This does not re-read the PDF or verify a bank deposit.</CardDescription></CardHeader>
    <CardContent className="space-y-4">
      {historical && <p className="text-sm">Historical check only: this statement was replaced and is excluded from current dashboard totals.</p>}
      <dl className="grid gap-3 text-sm">
        {[
          ["Carrier-reported statement total", check.reportedCents],
          ["Imported commission entries total", check.importedCents],
          [check.previousCents !== null && check.previousCents < 0 ? "Amount deducted from previous statements" : "Amount added from previous statements", check.previousCents],
          ["Imported entries plus previous-statement amount", check.calculatedCents],
          ["Difference (reported total minus calculated total)", check.differenceCents],
        ].map(([label, amount]) => <div key={String(label)} className="flex flex-wrap justify-between gap-2 border-b pb-2"><dt>{label}</dt><dd className="font-medium tabular-nums">{money(amount as number | null)}</dd></div>)}
      </dl>
      <p className="text-sm">Entry count: {check.importedCount ?? "unavailable"} readable entries; {check.recordedCount ?? "unknown"} recorded at import.</p>
      {check.status === "match" && <p className="text-sm">The imported entries and previous-statement amount add up to the saved carrier total, and the entry count matches.</p>}
      {check.status === "difference" && <div className="space-y-2 text-sm"><p>The saved statement figures and readable imported entries do not fully agree. Compare the source statement and import history before making any changes.</p>{check.differenceCents !== null && check.differenceCents !== 0 && <p>The carrier total is {check.differenceCents > 0 ? "higher" : "lower"} than the calculated total by {formatCents(Math.abs(check.differenceCents))}.</p>}{check.countMatches === false && <p>The readable entry count differs from the count recorded at import.</p>}<p>Prior imports, excluded entries, or access restrictions may explain a difference. This check does not prove a missing or unpaid commission.</p></div>}
      {check.status === "unavailable" && <p className="text-sm">A saved figure or complete entry read is unavailable, so a reliable match cannot be confirmed. Missing values are not treated as zero. Try again or compare the source statement.</p>}
      <p className="text-xs text-muted-foreground">Read-only check. Imported records, assignments, approvals and dashboard amounts are unchanged.</p>
    </CardContent>
  </Card>;
}
