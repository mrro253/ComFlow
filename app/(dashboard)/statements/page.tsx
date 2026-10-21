import { listStatementReview } from "@/lib/services/statementReviewService";
import { statementCoverage } from "@/lib/reporting/statementCoverage";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { listSupportedCarriers } from "@/lib/carriers";
import { formatCents } from "@/lib/carriers/money";
import { listStatementCoverage, listStatements } from "@/lib/repositories/statementRepository";
import { listUsersForAgency } from "@/lib/repositories/userRepository";
import { STATEMENT_STATUS_BADGE } from "@/components/statements/status";
import { UploadStatementForm } from "@/components/statements/upload-statement-form";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate } from "@/lib/utils";
import { canManageStatements } from "@/lib/auth/statementAccess";

export default async function StatementsPage({ searchParams }: { searchParams: Promise<{ year?: string; repeats?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canManageStatements(user)) redirect("/dashboard");

  const [statements, team, coverageStatements] = await Promise.all([listStatements(), listUsersForAgency(user.agencyId), listStatementCoverage()]);
  const review = await listStatementReview();
  const params = await searchParams;
  const repeats = review.filter((r) => r.label === "Already imported");
  const queue = review.filter((r) => r.label !== "Already imported");
  const shown = params.repeats === "show" ? review : queue;
  const currentYear = new Date().getUTCFullYear();
  const years = [...new Set([currentYear, ...coverageStatements.flatMap((s) => s.statementMonth ? [Number(s.statementMonth.slice(0, 4))] : [])])].filter((y) => Number.isInteger(y) && y >= 2000 && y <= 2099).sort((a, b) => b - a);
  const requestedYear = Number(params.year);
  const year = years.includes(requestedYear) ? requestedYear : currentYear;
  const coverage = statementCoverage(coverageStatements, year);
  const independents =
    user.role === "owner"
      ? team
          .filter((u) => u.agentType === "independent" && u.role !== "owner" && u.active)
          .map((u) => ({ id: u.id, name: `${u.firstName} ${u.lastName}` }))
      : [];
  const nameById = new Map(team.map((u) => [u.id, `${u.firstName} ${u.lastName}`]));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Statements</h1>
        <p className="text-sm text-muted-foreground">
          Carrier commission statements are the source of truth for what was actually paid.
        </p>
      </div>

      {user.role === "owner" && process.env.DEVOTED_REVIEW_ENABLED === "true" && <Link href="/statements/devoted" className="text-sm font-medium underline">Review a Devoted PDF/workbook pair</Link>}
      <Card>
        <CardHeader>
          <CardTitle>Upload a statement</CardTitle>
          <CardDescription>
            Upload a carrier PDF manually. Statements pulled from carrier portals appear here too.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <UploadStatementForm
            carriers={listSupportedCarriers()}
            independents={independents}
            ownBookOnly={user.role !== "owner"}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Statements to review ({queue.length})</CardTitle>
          <CardDescription>New statement means no imported statement for that carrier, owner, and month. Possible correction means one is already on file; compare the reports before importing. These labels do not change your commissions.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">{repeats.length} confirmed repeat downloads already imported. Saved files remain in History.</p>
          <Link className="text-sm underline" href={`/statements?year=${year}${params.repeats === "show" ? "" : "&repeats=show"}`}>{params.repeats === "show" ? "Hide confirmed repeats" : "Show confirmed repeats"}</Link>
          {shown.length === 0 && <p className="text-sm">No registered statements need review.</p>}
          <ul className="divide-y">{shown.map(({ statement: s, label }) => <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
            <Link href={`/statements/${s.id}`} className="font-medium underline">{s.carrier} · {s.statementMonth ?? "Month needs verification"} · {s.userId ? nameById.get(s.userId) ?? "Agent" : "Agency"}</Link>
            <Badge variant={label === "Already imported" ? "outline" : "secondary"}>{label}</Badge>
          </li>)}</ul>
          <p className="text-xs text-muted-foreground">Unreadable reports stay in review. Devoted PDF/spreadsheet pairs use the separate Devoted review link above.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Statements by month</CardTitle>
          <CardDescription>For each carrier and statement owner already on file. None on file means no saved statement for that month; it does not mean commission is missing or unpaid. Multiple statements can belong to one month.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="mb-4 flex flex-wrap items-end gap-3" method="get">
            <label className="grid gap-1 text-sm">Year<select name="year" defaultValue={year} className="h-10 rounded-md border bg-background px-3">{years.map((y) => <option key={y}>{y}</option>)}</select></label>
            <button className="min-h-10 rounded-md border px-4 text-sm" type="submit">Show year</button>
          </form>
          {coverage.length === 0 && <p className="text-sm text-muted-foreground">No active statements on file yet.</p>}
          <div className="grid gap-4 lg:grid-cols-2">
            {coverage.map((group) => <section key={JSON.stringify([group.carrier, group.userId])} className="min-w-0 rounded-md border p-3">
              <h3 className="break-words font-medium">{group.carrier}</h3>
              <p className="mb-3 text-sm text-muted-foreground">{group.userId ? nameById.get(group.userId) ?? "Agent" : "Agency"}</p>
              <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">{group.months.map((status, index) => <li key={index} className="rounded border p-2 text-sm"><span className="block font-medium">{new Date(Date.UTC(year, index, 1)).toLocaleString("en-US", { month: "short", timeZone: "UTC" })}</span><span className="text-xs text-muted-foreground">{status}</span></li>)}</ul>
            </section>)}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">Superseded copies are excluded. Statements without a verified month remain in History. Download-only Devoted files are not registered statements and are not included.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>History</CardTitle>
          <CardDescription>Latest 100 saved statements. On a phone, swipe the table sideways to see all columns. Statement totals are carrier-reported amounts, not verified bank deposits.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>File</TableHead>
                <TableHead>Carrier</TableHead>
                <TableHead>For</TableHead>
                <TableHead>Month</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Commission entries</TableHead>
                <TableHead className="text-right">Statement total</TableHead>
                <TableHead className="text-right">Received</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {statements.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="py-10 text-center text-sm text-muted-foreground">
                    No statements yet. Upload a PDF above to get started.
                  </TableCell>
                </TableRow>
              )}
              {statements.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">
                    <Link href={`/statements/${s.id}`} className="hover:underline">
                      {s.originalFilename ?? "Portal statement"}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{s.carrier}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {s.userId ? (nameById.get(s.userId) ?? "Agent") : "Agency"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{s.statementMonth ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {s.source === "portal" ? "Carrier portal" : "Manual upload"}
                  </TableCell>
                  <TableCell>
                    <Badge variant={STATEMENT_STATUS_BADGE[s.status].variant}>{review.find((r) => r.statement.id === s.id)?.label ?? STATEMENT_STATUS_BADGE[s.status].label}</Badge>
                  </TableCell>
                  <TableCell className="text-right">{s.transactionCount ?? "—"}</TableCell>
                  <TableCell className="text-right">
                    {s.statementTotalCents === null ? "—" : formatCents(s.statementTotalCents)}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">{formatDate(s.createdAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
