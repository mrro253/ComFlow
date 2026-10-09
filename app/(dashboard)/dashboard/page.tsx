import Link from "next/link";
import { redirect } from "next/navigation";
import { CircleDollarSign, FileText, Hash, UserX } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { getAgencyById } from "@/lib/repositories/agencyRepository";
import { listVisibleConnections } from "@/lib/repositories/carrierConnectionRepository";
import { listStatements, listVisibleTransactions } from "@/lib/repositories/statementRepository";
import { listUsersForAgency } from "@/lib/repositories/userRepository";
import { formatCents } from "@/lib/carriers/money";
import {
  latestMonth,
  monthlyPaidSeries,
  PRODUCER_GROUP_LABELS,
  sumCents,
  totalsByCategory,
  totalsByProducerGroup,
} from "@/lib/reporting/carrierMetrics";
import { isOnboardingIncomplete } from "@/lib/onboarding";
import { StatCard } from "@/components/dashboard/stat-card";
import { BarChartCard } from "@/components/dashboard/bar-chart-card";
import { OnboardingChecklistCard } from "@/components/dashboard/onboarding-checklist-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const SCOPE_LABEL = {
  owner: "Everything the carriers paid across your agency.",
  manager: "Payments for you and your direct reports.",
  agent: "Your carrier payments.",
} as const;

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const isOwner = user.role === "owner";
  // RLS scopes every query below to what this user is allowed to see.
  const [transactions, team] = await Promise.all([listVisibleTransactions(), listUsersForAgency(user.agencyId)]);

  const [agency, statements, connections] = isOwner
    ? await Promise.all([getAgencyById(user.agencyId), listStatements(5), listVisibleConnections()])
    : [null, [], []];
  const showChecklist = isOwner && agency !== null && isOnboardingIncomplete(agency);

  const month = latestMonth(transactions);
  const inMonth = month ? transactions.filter((tx) => tx.statementMonth === month) : [];
  const usersById = new Map(team.map((u) => [u.id, u]));
  const unassignedCount = inMonth.filter((tx) => tx.userId === null).length;
  const categories = totalsByCategory(inMonth);
  const groups = isOwner ? totalsByProducerGroup(inMonth, usersById) : [];
  const pendingReview = statements.filter((s) => s.status !== "imported").length;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">{SCOPE_LABEL[user.role]}</p>
      </div>

      {showChecklist && (
        <OnboardingChecklistCard
          hasTeammates={team.length > 1}
          hasStatements={statements.length > 0}
          hasCarrierLogin={connections.some((c) => c.userId === user.id && c.status !== "disabled")}
        />
      )}

      {transactions.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No carrier payments yet</CardTitle>
            <CardDescription>
              {isOwner
                ? "Upload a carrier commission statement, or connect a carrier login, to see what you were paid."
                : "Payments appear here once your carrier statements have been imported."}
            </CardDescription>
          </CardHeader>
          {isOwner && (
            <CardContent>
              <Button asChild>
                <Link href="/statements">Upload a statement</Link>
              </Button>
            </CardContent>
          )}
        </Card>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Paid by carrier" value={formatCents(sumCents(inMonth))} icon={CircleDollarSign} hint={month ?? undefined} />
            <StatCard label="Payments" value={String(inMonth.length)} icon={Hash} hint={month ?? undefined} />
            {isOwner && (
              <>
                <StatCard label="Unassigned" value={String(unassignedCount)} icon={UserX} hint="Need an agent assigned" />
                <StatCard label="Statements to review" value={String(pendingReview)} icon={FileText} />
              </>
            )}
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <BarChartCard title="Paid by carrier, by month" data={monthlyPaidSeries(transactions)} barColor="hsl(var(--chart-1))" />
            {/* BarChartCard plots {month,total}; here the "month" axis carries the payment category. */}
            <BarChartCard
              title={`Payment categories${month ? ` - ${month}` : ""}`}
              data={categories.map((c) => ({ month: c.type, total: c.cents / 100 }))}
              barColor="hsl(var(--chart-2))"
            />
          </div>

          {groups.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Where it came from</CardTitle>
                <CardDescription>
                  {month} - the owner&apos;s personal production is kept separate from the agency&apos;s.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-3">
                {groups.map((g) => (
                  <div key={g.group} className="min-w-44 rounded-md border border-border p-3">
                    <div className="text-xs text-muted-foreground">{PRODUCER_GROUP_LABELS[g.group]}</div>
                    <div className={cn("text-lg font-semibold", g.cents < 0 && "text-destructive")}>{formatCents(g.cents)}</div>
                    <div className="text-xs text-muted-foreground">
                      {g.count} payment{g.count === 1 ? "" : "s"}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
