import Link from "next/link";
import { redirect } from "next/navigation";
import { CircleDollarSign, FileText, Hash, UserX } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { getAgencyById } from "@/lib/repositories/agencyRepository";
import { listVisibleConnections } from "@/lib/repositories/carrierConnectionRepository";
import { listVisibleTransactions } from "@/lib/repositories/statementRepository";
import { getStatementWorklists } from "@/lib/services/statementWorklistService";
import { listUsersForAgency } from "@/lib/repositories/userRepository";
import { formatCents } from "@/lib/carriers/money";
import {
  monthLabel,
  PRODUCER_GROUP_LABELS,
  sumCents,
  totalsByCategory,
  totalsByProducerGroup,
} from "@/lib/reporting/carrierMetrics";
import { selectDashboardMonth, selectDashboardYear, selectDashboardQuarter } from "@/lib/reporting/dashboardMonth";
import { isOnboardingIncomplete } from "@/lib/onboarding";
import { StatCard } from "@/components/dashboard/stat-card";
import { BarChartCard } from "@/components/dashboard/bar-chart-card";
import { CarrierMonthlyChart } from "@/components/dashboard/carrier-monthly-chart";
import { carrierMonthlySeries } from "@/lib/reporting/carrierMonthlySeries";
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
  searchParams: Promise<{ month?: string | string[]; view?: string; period?: string; year?: string | string[]; quarter?: string | string[] }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const params = await searchParams;

  const isOwner = user.role === "owner";
  // RLS scopes every query below to what this user is allowed to see.
  const [transactions, team] = await Promise.all([listVisibleTransactions(), listUsersForAgency(user.agencyId)]);

  const [agency, statementWork, connections, levels] = isOwner
    ? await Promise.all([
        getAgencyById(user.agencyId),
        getStatementWorklists(user),
        listVisibleConnections(),
        listCareerLevels(user.agencyId),
      ])
    : [null, { statements: [], needsAttention: [], downloadedPairs: [] }, [], []];
  const statements = statementWork.statements;
  const showChecklist = isOwner && agency !== null && isOnboardingIncomplete(agency);

  const { months, month, unavailable } = selectDashboardMonth(
    transactions.map((tx) => tx.statementMonth), params.month
  );
  const annual = params.period === "annual";
  const quarterly = params.period === "quarterly";
  const yearView = annual || quarterly;
  const periodName = quarterly ? "quarter" : annual ? "year" : "month";
  const annualSelection = selectDashboardYear(transactions.map(tx => tx.statementMonth), params.year);
  const year = annualSelection.year;
  const quarterSelection = selectDashboardQuarter(transactions.map(tx => tx.statementMonth), year, params.quarter);
  const periodLabel = quarterly ? `Q${quarterSelection.quarter} ${year}` : annual ? year : month ? monthLabel(month) : null;
  const inPeriod = transactions.filter(tx => quarterly ? year !== null && tx.statementMonth >= quarterSelection.start && tx.statementMonth <= quarterSelection.end : annual ? year !== null && tx.statementMonth.startsWith(`${year}-`) : month !== null && tx.statementMonth === month);
  const usersById = new Map(team.map((u) => [u.id, u]));
  const unassignedCount = inPeriod.filter((tx) => tx.userId === null).length;
  const categories = totalsByCategory(inPeriod);
  const groups = isOwner ? totalsByProducerGroup(inPeriod, usersById) : [];
  const pendingReview = statementWork.needsAttention.length + statementWork.downloadedPairs.length;

  return (
    <div className="flex flex-col gap-6">
      {["owner", "agent"].includes(user.role) && <Link className="inline-flex rounded-md border px-4 py-2 text-sm font-medium" href="/sales">View enrollment payment status</Link>}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">{SCOPE_LABEL[user.role]}</p>
        </div>
        <Button asChild variant="outline"><Link href={yearView && year ? quarterly ? `/reports?from=${quarterSelection.start}&to=${quarterSelection.end}` : `/reports?from=${year}-01&to=${year}-12` : month ? `/payments?month=${month}` : "/payments"}>{quarterly ? "View quarterly report" : annual ? "View annual report" : "View commission activity"}</Link></Button>
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
            <nav aria-label="Commission period" className="mb-4 flex gap-2">
              <Link aria-current={!yearView ? "page" : undefined} className={cn("rounded-md border px-4 py-2", !yearView && "bg-primary text-primary-foreground")} href={month ? `/dashboard?month=${month}` : "/dashboard"}>Monthly</Link>
              <Link aria-current={quarterly ? "page" : undefined} className={cn("rounded-md border px-4 py-2", quarterly && "bg-primary text-primary-foreground")} href={`/dashboard?period=quarterly${year ? `&year=${year}` : ""}`}>Quarterly</Link>
              <Link aria-current={annual ? "page" : undefined} className={cn("rounded-md border px-4 py-2", annual && "bg-primary text-primary-foreground")} href={`/dashboard?period=annual${year ? `&year=${year}` : ""}`}>Annual</Link>
            </nav>
            {yearView ? <form method="get" className="flex flex-wrap items-end gap-3">
              <input type="hidden" name="period" value={quarterly ? "quarterly" : "annual"} />
              <label className="flex flex-col gap-1.5 font-medium">Statement year<select name="year" defaultValue={year ?? ""} key={year} className="h-9 rounded-md border border-input bg-background px-3 text-sm">{annualSelection.years.map(option => <option key={option}>{option}</option>)}</select></label>
              {quarterly && <label className="flex flex-col gap-1.5 font-medium">Quarter<select name="quarter" defaultValue={String(quarterSelection.quarter)} key={quarterSelection.quarter} className="h-9 rounded-md border border-input bg-background px-3 text-sm">{[1, 2, 3, 4].map(option => <option key={option} value={option}>Q{option}</option>)}</select></label>}
              <Button type="submit" size="sm">Show {quarterly ? "quarter" : "year"}</Button>
            </form> : <form method="get" className="flex flex-wrap items-end gap-3">
              <label className="flex min-w-0 flex-col gap-1.5 font-medium">Statement month
                <select name="month" defaultValue={month ?? ""} key={month} className="h-9 max-w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm">
                  {months.map(option => <option key={option} value={option}>{monthLabel(option)}</option>)}
                </select>
              </label>
              <Button type="submit" size="sm">Show month</Button>
              <Link href="/dashboard" className="py-2 text-sm underline underline-offset-4">Latest month</Link>
            </form>}
            <p className="mt-3 font-medium">{quarterly ? "Showing statement quarter" : annual ? "Showing statement year" : "Showing statement month"}: {periodLabel}</p>
            {(yearView ? annualSelection.unavailable || quarterly && quarterSelection.unavailable : unavailable) && <p role="status" className="mt-1 text-muted-foreground">That selection is not available in your commission activity. Showing the latest available period instead.</p>}
            {yearView && <p className="mt-1 text-muted-foreground">Includes imported commission entries from {quarterly ? quarterSelection.monthsOnFile : annualSelection.monthsOnFile} of {quarterly ? 3 : 12} statement months in {periodLabel}. Missing months are not assumed to be zero. Reversals and adjustments are included; this is not a forecast.</p>}
            <p className="mt-1 text-muted-foreground">
              The commission totals, categories and production breakdown show the selected {periodName}. The monthly chart shows {yearView ? `imported months in that ${periodName}` : "all imported months"}; the statement-review count covers all verified review items across months.
              One carrier payment can cover several commission entries. These totals are statement activity; bank deposits are not verified here.
              Amounts added or deducted from previous statements can make a statement total different from its commission entries.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label={quarterly ? "Quarterly commission total" : annual ? "Annual commission total" : "Commission total"} value={formatCents(sumCents(inPeriod))} icon={CircleDollarSign} hint="Carrier-reported entry total, not take-home earnings" />
            <StatCard label="Commission entries" value={String(inPeriod.length)} icon={Hash} hint="Statement lines, not bank deposits" />
            {isOwner && (
              <>
                <StatCard label="Unassigned entries" value={String(unassignedCount)} icon={UserX} hint={`Entries in this ${periodName} needing an agent`} />
                <StatCard label="Statements needing review" value={String(pendingReview)} icon={FileText} hint="Files requiring a decision; verified repeat copies excluded" />
              </>
            )}
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <CarrierMonthlyChart {...carrierMonthlySeries(yearView ? inPeriod : transactions)} />
            {/* BarChartCard plots {month,total}; here the "month" axis carries the payment category. */}
            <BarChartCard
              title={`Commission categories${periodLabel ? ` - ${periodLabel}` : ""}`}
              data={categories.map((c) => ({ month: c.type, total: c.cents / 100 }))}
              barColor="hsl(var(--chart-2))"
            />
          </div>

          {groups.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Carrier commissions by production group</CardTitle>
                <CardDescription>
                  {periodLabel} — owner personal production, Career agents and Independent agents are shown separately. These are carrier-reported amounts; Career agent earnings may differ under their compensation plan. A group appears only when it has entries.
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
