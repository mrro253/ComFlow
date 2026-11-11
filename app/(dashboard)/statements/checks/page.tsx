import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { canManageStatements } from "@/lib/auth/statementAccess";
import { loadStatementTotalsOverview } from "@/lib/services/statementTotalsService";
import { formatCents } from "@/lib/carriers/money";
import { TOTALS_LABEL } from "@/components/statements/statement-totals-check";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default async function StatementChecksPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canManageStatements(user)) redirect("/dashboard");
  let results: Awaited<ReturnType<typeof loadStatementTotalsOverview>> = [];
  let failed = false;
  try { results = await loadStatementTotalsOverview(user); } catch { failed = true; }
  const money = (n: number | null) => n === null ? "Not available" : formatCents(n);
  return <div className="flex min-w-0 flex-col gap-6">
    <div><Link className="text-sm underline" href="/statements">All statements</Link><h1 className="mt-2 text-2xl font-semibold">Statement totals checks</h1><p className="mt-2 text-sm text-muted-foreground">Checks every current imported statement you can access. Open a statement for the calculation and any explanation. Superseded versions are excluded here and remain available on their detail pages.</p></div>
    {failed ? <p role="alert" className="rounded-md border p-4 text-sm">The complete statement list could not be loaded. No overall result is available; refresh to try again.</p> : <>
      <div className="grid gap-4 sm:grid-cols-3">{(["match", "difference", "unavailable"] as const).map((status) => <Card key={status}><CardHeader><CardTitle>{TOTALS_LABEL[status]}</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">{results.filter((r) => r.check.status === status).length}</CardContent></Card>)}</div>
      <Card className="min-w-0"><CardHeader><CardTitle>Imported statement checks ({results.length})</CardTitle><p className="text-sm text-muted-foreground">Saved carrier totals are compared with readable imported entries plus signed amounts from previous statements. Bank deposits are not verified. On a phone, swipe the table sideways.</p></CardHeader><CardContent className="p-0"><Table>
        <TableHeader><TableRow><TableHead>Statement</TableHead><TableHead>Result</TableHead><TableHead className="text-right">Reported total</TableHead><TableHead className="text-right">Imported entries</TableHead><TableHead className="text-right">From previous statements</TableHead><TableHead className="text-right">Difference</TableHead></TableRow></TableHeader>
        <TableBody>{!results.length && <TableRow><TableCell colSpan={6} className="p-6 text-center">No current imported statements to check.</TableCell></TableRow>}{results.map(({ statement, check }) => <TableRow key={statement.id}><TableCell><Link className="underline" href={`/statements/${statement.id}`}>{statement.carrier} · {statement.statementMonth ?? "Month unavailable"}</Link></TableCell><TableCell><Badge variant={check.status === "match" ? "success" : check.status === "difference" ? "destructive" : "secondary"}>{TOTALS_LABEL[check.status]}</Badge></TableCell><TableCell className="text-right">{money(check.reportedCents)}</TableCell><TableCell className="text-right">{money(check.importedCents)}</TableCell><TableCell className="text-right">{money(check.previousCents)}</TableCell><TableCell className="text-right">{money(check.differenceCents)}</TableCell></TableRow>)}</TableBody>
      </Table></CardContent></Card>
    </>}
    <p className="text-xs text-muted-foreground">Differences need review; they do not automatically mean missing or unpaid commissions. This page makes no changes to imported records.</p>
  </div>;
}
