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
  monthLabel,
  monthlyPaidSeries,
  PRODUCER_GROUP_LABELS,
  sumCents,
  totalsByCategory,
  totalsByProducerGroup,
} from "@/lib/reporting/carrierMetrics";
import { selectDashboardMonth } from "@/lib/reporting/dashboardMonth";
import { isOnboardingIncomplete } from "@/lib/onboarding";
import { StatCard } from "@/components/dashboard/stat-card";
import { BarChartCard } from "@/components/dashboard/bar-chart-card";
import { listCareerLevels } from "@/lib/repositories/compensationSettingsRepository";
import { OnboardingChecklistCard } from "@/components/dashboard/onboarding-checklist-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const SCOPE_LABEL = {
  owner: "Carrier statement activity for your personal production and your team.",
  manager: "Commission entries for you and your direct reports.",
  agent: "Your carrier commission activity.",
} as const;

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string | string[] }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const isOwner = user.role === "owner";
  // RLS scopes every query below to what this user is allowed to see.
  const [transactions, team] = await Promise.all([listVisibleTransactions(), listUsersForAgency(user.agencyId)]);

  const [agency, statements, connections, levels] = isOwner
    ? await Promise.all([
        getAgencyById(user.agencyId),
        listStatements(5),
        listVisibleConnections(),
        listCareerLevels(user.agencyId),
      ])
    : [null, [], [], []];
  const showChecklist = isOwner && agency !== null && isOnboardingIncomplete(agency);

  const params = await searchParams;
  const { months, month, unavailable } = selectDashboardMonth(
    transactions.map((tx) => tx.statementMonth), params.month
  );
  const periodLabel = month ? monthLabel(month) : null;
  const inMonth = month ? transactions.filter((tx) => tx.statementMonth === month) : [];
  const usersById = new Map(team.map((u) => [u.id, u]));
  const unassignedCount = inMonth.filter((tx) => tx.userId === null).length;
  const categories = totalsByCategory(inMonth);
  const groups = isOwner ? totalsByProducerGroup(inMonth, usersById) : [];
  const pendingReview = statements.filter((s) => s.status !== "imported" && s.status !== "superseded").length;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">{SCOPE_LABEL[user.role]}</p>
        </div>
        <Button asChild variant="outline"><Link href={month ? `/payments?month=${month}` : "/payments"}>View commission activity</Link></Button>
      </div>

      {showChecklist && (
        <OnboardingChecklistCard
          hasCompensation={levels.length > 0}
          hasTeammates={team.length > 1}
          hasStatements={statements.length > 0}
          hasCarrierLogin={connections.some((c) => c.userId === user.id && c.status !== "disabled")}
        />
      )}

      {transactions.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No commission entries yet</CardTitle>
            <CardDescription>
              {isOwner
                ? "Upload a carrier commission statement, or connect a carrier login, to review the commission entries reported by the carrier."
                : "Commission entries appear here once your carrier statements have been imported."}
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
          <div className="rounded-lg border border-border bg-card p-4 text-sm">
            <form method="get" className="flex flex-wrap items-end gap-3">
              <label className="flex min-w-0 flex-col gap-1.5 font-medium">
                Statement month
                <select name="month" defaultValue={month ?? ""} key={month} className="h-9 max-w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm">
                  {months.map((option) => <option key={option} value={option}>{monthLabel(option)}</option>)}
                </select>
              </label>
              <Button type="submit" size="sm">Show month</Button>
              <Link href="/dashboard" className="py-2 text-sm underline underline-offset-4">Latest month</Link>
            </form>
            <p className="mt-3 font-medium">Showing statement month: {periodLabel}</p>
            {unavailable && <p role="status" className="mt-1 text-muted-foreground">That month is not available in your commission activity. Showing your latest available month instead.</p>}
            <p className="mt-1 text-muted-foreground">
              The commission totals, categories and production breakdown show the selected month. The monthly chart shows all imported months; the recent-review count covers the five most recent statements across months.
              One carrier payment can cover several commission entries. These totals are statement activity; bank deposits are not verified here.
              Carried balances can make a statement total different from its commission entries.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Commission total" value={formatCents(sumCents(inMonth))} icon={CircleDollarSign} hint="Sum of this month’s commission entries" />
            <StatCard label="Commission entries" value={String(inMonth.length)} icon={Hash} hint="Statement lines, not bank deposits" />
            {isOwner && (
              <>
                <StatCard label="Unassigned entries" value={String(unassignedCount)} icon={UserX} hint="Entries in this month needing an agent" />
                <StatCard label="Recent statements needing review" value={String(pendingReview)} icon={FileText} hint="Among the five most recent statements" />
              </>
            )}
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <BarChartCard title="Commission totals by statement month" data={monthlyPaidSeries(transactions)} barColor="hsl(var(--chart-1))" />
            {/* BarChartCard plots {month,total}; here the "month" axis carries the payment category. */}
            <BarChartCard
              title={`Commission categories${month ? ` - ${periodLabel}` : ""}`}
              data={categories.map((c) => ({ month: c.type, total: c.cents / 100 }))}
              barColor="hsl(var(--chart-2))"
            />
          </div>

          {groups.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Production breakdown</CardTitle>
                <CardDescription>
                  {periodLabel} — owner personal production, Career agents and Independent agents are shown separately. A group appears only when it has entries.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-2">
                {groups.map((g) => (
                  <div key={g.group} className="min-w-0 rounded-md border border-border p-3">
                    <div className="text-xs text-muted-foreground">{PRODUCER_GROUP_LABELS[g.group]}</div>
                    <div className={cn("text-lg font-semibold", g.cents < 0 && "text-destructive")}>{formatCents(g.cents)}</div>
                    <div className="text-xs text-muted-foreground">
                      {g.count} commission entr{g.count === 1 ? "y" : "ies"}
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
