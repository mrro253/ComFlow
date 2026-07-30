import { DollarSign, Target, TrendingUp, Users } from "lucide-react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { getAgencyById } from "@/lib/repositories/agencyRepository";
import { getConnectionForAgency } from "@/lib/repositories/crmConnectionRepository";
import { buildNameMap, getScopedTransactions } from "@/lib/reporting/scopedTransactions";
import {
  buildMonthlyCommissionSeries,
  buildMonthlySalesSeries,
  buildTopAgents,
  countUniqueOpportunities,
  sumCommission,
  sumUniqueSaleAmount,
} from "@/lib/reporting/metrics";
import { isOnboardingIncomplete } from "@/lib/onboarding";
import { StatCard } from "@/components/dashboard/stat-card";
import { BarChartCard } from "@/components/dashboard/bar-chart-card";
import { OnboardingChecklistCard } from "@/components/dashboard/onboarding-checklist-card";
import { TopAgentsTable } from "@/components/dashboard/top-agents-table";
import { TransactionsTable, type TransactionRow } from "@/components/dashboard/transactions-table";
import { formatCurrency } from "@/lib/utils";

const RECENT_TRANSACTIONS_LIMIT = 8;

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { transactions, scopeUsers, scopeLabel } = await getScopedTransactions(user, 300);
  const nameById = buildNameMap(scopeUsers);

  // Owner-only setup checklist - never fetched/shown for Managers or Agents.
  const showOnboardingChecklist = user.role === "owner";
  const [agency, crmConnection] = showOnboardingChecklist
    ? await Promise.all([getAgencyById(user.agencyId), getConnectionForAgency(user.agencyId)])
    : [null, null];
  const shouldShowOnboardingChecklist =
    showOnboardingChecklist && agency !== null && isOnboardingIncomplete(agency);

  const totalSales = sumUniqueSaleAmount(transactions);
  const totalCommission = sumCommission(transactions);
  const enrolledCount = countUniqueOpportunities(transactions);
  const activeAgents = scopeUsers.filter((u) => u.role === "agent").length;

  const salesSeries = buildMonthlySalesSeries(transactions);
  const commissionSeries = buildMonthlyCommissionSeries(transactions);
  // Ranking makes sense only when there's a team to rank - an individual
  // agent viewing their own dashboard doesn't need a leaderboard of one.
  const topAgents = user.role === "agent" ? [] : buildTopAgents(transactions, scopeUsers, 5);

  const recentRows: TransactionRow[] = transactions
    .slice(0, RECENT_TRANSACTIONS_LIMIT)
    .map((tx) => ({
      id: tx.id,
      recipientName: nameById.get(tx.userId) ?? "Unknown",
      role: tx.role,
      businessType: tx.businessType,
      opportunityId: tx.opportunityId,
      saleAmount: tx.saleAmount,
      commissionAmount: tx.commissionAmount,
      createdAt: tx.createdAt,
    }));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">{scopeLabel}</p>
      </div>

      {shouldShowOnboardingChecklist && (
        <OnboardingChecklistCard
          hasTeammates={scopeUsers.length > 1}
          hasCrmConnection={crmConnection !== null}
        />
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total sales" value={formatCurrency(totalSales)} icon={TrendingUp} />
        <StatCard label="Total commissions" value={formatCurrency(totalCommission)} icon={DollarSign} />
        <StatCard label="Active agents" value={String(activeAgents)} icon={Users} />
        <StatCard label="Enrolled opportunities" value={String(enrolledCount)} icon={Target} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <BarChartCard title="Monthly sales" data={salesSeries} barColor="hsl(var(--chart-1))" />
        <BarChartCard title="Monthly commissions" data={commissionSeries} barColor="hsl(var(--chart-2))" />
      </div>

      {topAgents.length > 0 && <TopAgentsTable agents={topAgents} />}

      <TransactionsTable
        transactions={recentRows}
        showRecipient={user.role !== "agent"}
        title="Recent transactions"
        description="The latest commission activity in your scope."
      />
    </div>
  );
}
