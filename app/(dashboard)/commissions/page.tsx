import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { buildNameMap, getScopedTransactions } from "@/lib/reporting/scopedTransactions";
import { FilterableCommissionsTable } from "@/components/commissions/filterable-commissions-table";
import type { TransactionRow } from "@/components/dashboard/transactions-table";

const COMMISSIONS_PAGE_LIMIT = 200;

export default async function CommissionsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { transactions, scopeUsers, scopeLabel } = await getScopedTransactions(
    user,
    COMMISSIONS_PAGE_LIMIT
  );
  const nameById = buildNameMap(scopeUsers);

  const rows: TransactionRow[] = transactions.map((tx) => ({
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
        <h1 className="text-2xl font-semibold tracking-tight">Commissions</h1>
        <p className="text-sm text-muted-foreground">{scopeLabel}</p>
      </div>

      <FilterableCommissionsTable transactions={rows} showRecipient={user.role !== "agent"} />
    </div>
  );
}
