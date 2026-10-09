import Link from "next/link";
import { redirect } from "next/navigation";
import { CircleDollarSign, Hash, UserX } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { formatCents } from "@/lib/carriers/money";
import { latestMonth, sumCents, totalsByCategory } from "@/lib/reporting/carrierMetrics";
import { listVisibleTransactions } from "@/lib/repositories/statementRepository";
import { listUsersForAgency } from "@/lib/repositories/userRepository";
import { AssignPaymentForm } from "@/components/payments/assign-payment-form";
import { StatCard } from "@/components/dashboard/stat-card";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

const MAX_ROWS_SHOWN = 300;

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; view?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { month: monthParam, view } = await searchParams;
  const [all, team] = await Promise.all([listVisibleTransactions(), listUsersForAgency(user.agencyId)]);
  const nameById = new Map(team.map((u) => [u.id, `${u.firstName} ${u.lastName}`]));

  const months = [...new Set(all.map((tx) => tx.statementMonth))].sort().reverse();
  const month = monthParam === "all" ? null : (monthParam && months.includes(monthParam) ? monthParam : latestMonth(all));
  const unassignedOnly = view === "unassigned" && user.role === "owner";

  const inMonth = month ? all.filter((tx) => tx.statementMonth === month) : all;
  const rows = unassignedOnly ? inMonth.filter((tx) => tx.userId === null) : inMonth;
  const unassignedCount = inMonth.filter((tx) => tx.userId === null).length;
  const categories = totalsByCategory(inMonth);
  const isOwner = user.role === "owner";
  const assignable = team
    .filter((u) => u.active)
    .map((u) => ({ id: u.id, name: `${u.firstName} ${u.lastName}` }));

  const linkClass = (active: boolean) =>
    cn("rounded-md px-3 py-1.5 text-sm", active ? "bg-secondary font-medium" : "text-muted-foreground hover:bg-secondary/60");

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Payments</h1>
        <p className="text-sm text-muted-foreground">
          What the carrier actually paid, straight from commission statements.
          {isOwner ? "" : " You only see your own payments."}
        </p>
      </div>

      {months.length > 0 && (
        <div className="flex flex-wrap items-center gap-1">
          {months.map((m) => (
            <Link key={m} href={`/payments?month=${m}`} className={linkClass(m === month)}>
              {m}
            </Link>
          ))}
          <Link href="/payments?month=all" className={linkClass(month === null)}>
            All months
          </Link>
          {isOwner && (
            <Link
              href={`/payments?month=${month ?? "all"}&view=${unassignedOnly ? "all" : "unassigned"}`}
              className={cn(linkClass(unassignedOnly), "ml-auto")}
            >
              Unassigned only ({unassignedCount})
            </Link>
          )}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Paid by carrier" value={formatCents(sumCents(inMonth))} icon={CircleDollarSign} hint={month ?? "All months"} />
        <StatCard label="Payments" value={String(inMonth.length)} icon={Hash} />
        {isOwner && (
          <StatCard label="Unassigned" value={String(unassignedCount)} icon={UserX} hint="Need an agent assigned" />
        )}
      </div>

      {categories.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>By payment category</CardTitle>
            <CardDescription>Chargebacks are negative and reduce the total.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3">
            {categories.map((c) => (
              <div key={c.type} className="min-w-40 rounded-md border border-border p-3">
                <div className="text-xs text-muted-foreground">{c.type}</div>
                <div className={cn("text-lg font-semibold", c.cents < 0 && "text-destructive")}>{formatCents(c.cents)}</div>
                <div className="text-xs text-muted-foreground">{c.count} payment{c.count === 1 ? "" : "s"}</div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Payment detail</CardTitle>
          {rows.length > MAX_ROWS_SHOWN && (
            <CardDescription>Showing the first {MAX_ROWS_SHOWN} of {rows.length}. Filter by month to narrow.</CardDescription>
          )}
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Effective</TableHead>
                <TableHead>Month</TableHead>
                <TableHead>Member ID</TableHead>
                <TableHead>Category</TableHead>
                {isOwner && <TableHead>Writing agent</TableHead>}
                {user.role !== "agent" && <TableHead>Assigned to</TableHead>}
                <TableHead className="text-right">Amount</TableHead>
                {isOwner && <TableHead className="text-right">Assign</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="py-10 text-center text-sm text-muted-foreground">
                    {isOwner ? "No payments yet. Upload a carrier statement to get started." : "No payments yet."}
                  </TableCell>
                </TableRow>
              )}
              {rows.slice(0, MAX_ROWS_SHOWN).map((tx) => (
                <TableRow key={tx.id}>
                  <TableCell>{tx.effectiveDate}</TableCell>
                  <TableCell className="text-muted-foreground">{tx.statementMonth}</TableCell>
                  <TableCell className="text-muted-foreground">{tx.memberId}</TableCell>
                  <TableCell>{tx.commissionType}</TableCell>
                  {isOwner && <TableCell className="text-muted-foreground">{tx.writingAgentName ?? "—"}</TableCell>}
                  {user.role !== "agent" && (
                    <TableCell>
                      {tx.userId ? (
                        <span className="text-muted-foreground">{nameById.get(tx.userId) ?? "Team member"}</span>
                      ) : (
                        <Badge variant="secondary">Unassigned</Badge>
                      )}
                    </TableCell>
                  )}
                  <TableCell className={cn("text-right font-medium", tx.amountCents < 0 && "text-destructive")}>
                    {formatCents(tx.amountCents)}
                  </TableCell>
                  {isOwner && (
                    <TableCell className="text-right">
                      {tx.userId === null ? (
                        <AssignPaymentForm transactionId={tx.id} team={assignable} canRemember={tx.writingAgentName !== null} />
                      ) : null}
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
