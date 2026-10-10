import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { formatCents } from "@/lib/carriers/money";
import { buildCollectiveReport } from "@/lib/reporting/collectiveReport";
import { listVisibleTransactions } from "@/lib/repositories/statementRepository";
import { listUsersForAgency } from "@/lib/repositories/userRepository";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

function monthParam(value: string | undefined): string | null {
  return value && MONTH.test(value) ? value : null;
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const params = await searchParams;
  const from = monthParam(params.from);
  const to = monthParam(params.to);

  const [transactions, team] = await Promise.all([
    listVisibleTransactions(),
    listUsersForAgency(user.agencyId),
  ]);
  const nameById = new Map(team.map((u) => [u.id, `${u.firstName} ${u.lastName}`]));
  const payments = transactions.map((tx) => ({
    statementMonth: tx.statementMonth,
    carrier: tx.carrier,
    memberId: tx.memberId,
    commissionType: tx.commissionType,
    amountCents: tx.amountCents,
    writingAgentName: tx.writingAgentName,
    creditedTo: tx.userId ? (nameById.get(tx.userId) ?? "Teammate") : null,
  }));
  const report = buildCollectiveReport(payments, from, to);
  const query = new URLSearchParams();
  if (from) query.set("from", from);
  if (to) query.set("to", to);
  const csvHref = `/api/reports/collective${query.size ? `?${query}` : ""}`;

  const isIndependent = user.agentType === "independent" && user.role !== "owner";

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {isIndependent ? "Collective report" : "Reports"}
        </h1>
        <p className="text-sm text-muted-foreground">
          {isIndependent
            ? "Your carrier-paid production, ready to download and send upstream if you choose. Nothing is sent automatically."
            : "Carrier-paid production in your scope. Download a CSV to share outside CommissionFlow."}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Range</CardTitle>
          <CardDescription>Statement months, inclusive. Leave blank for everything you can see.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="flex flex-wrap items-end gap-3" method="get">
            <label className="flex flex-col gap-1.5 text-sm">
              From
              <input
                type="month"
                name="from"
                defaultValue={from ?? ""}
                className="h-9 rounded-md border border-input bg-background px-3 text-sm shadow-sm"
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm">
              To
              <input
                type="month"
                name="to"
                defaultValue={to ?? ""}
                className="h-9 rounded-md border border-input bg-background px-3 text-sm shadow-sm"
              />
            </label>
            <button
              type="submit"
              className="inline-flex h-9 items-center rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground"
            >
              Apply
            </button>
            <a
              href={csvHref}
              className="inline-flex h-9 items-center rounded-md border border-input px-3 text-sm font-medium hover:bg-secondary"
            >
              Download CSV
            </a>
          </form>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Payments</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">{report.paymentCount}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Total paid by carrier</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">{formatCents(report.totalCents)}</CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>By category</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Category</TableHead>
                <TableHead className="text-right">Payments</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {report.byCategory.length === 0 && (
                <TableRow>
                  <TableCell colSpan={3} className="py-8 text-center text-sm text-muted-foreground">
                    No payments in this range.
                  </TableCell>
                </TableRow>
              )}
              {report.byCategory.map((c) => (
                <TableRow key={c.type}>
                  <TableCell>{c.type}</TableCell>
                  <TableCell className="text-right">{c.count}</TableCell>
                  <TableCell className="text-right font-medium">{formatCents(c.cents)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Payments in this range</CardTitle>
          <CardDescription>
            Showing {Math.min(report.rows.length, 300)} of {report.rows.length}. The CSV includes every row.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Month</TableHead>
                <TableHead>Member ID</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Writing agent</TableHead>
                <TableHead>Credited to</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {report.rows.slice(0, 300).map((row, i) => (
                <TableRow key={`${row.statementMonth}-${row.memberId}-${row.commissionType}-${i}`}>
                  <TableCell>{row.statementMonth}</TableCell>
                  <TableCell className="text-muted-foreground">{row.memberId}</TableCell>
                  <TableCell>{row.commissionType}</TableCell>
                  <TableCell className="text-muted-foreground">{row.writingAgentName ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{row.creditedTo ?? "Unassigned"}</TableCell>
                  <TableCell className="text-right font-medium">{formatCents(row.amountCents)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        This report is what the carrier paid, not what anyone is owed.{" "}
        <Link href="/payments" className="underline">
          Payments
        </Link>{" "}
        is the live list.
      </p>
    </div>
  );
}
