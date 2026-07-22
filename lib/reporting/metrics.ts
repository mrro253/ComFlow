import type { AppUser, CommissionTransaction } from "@/types/domain";

/**
 * Pure aggregation helpers for turning a flat list of commission
 * transactions into the numbers/series the dashboard UI renders. No
 * database or UI dependency here, so these are trivially unit testable -
 * same rationale as `lib/commission-engine`.
 *
 * IMPORTANT: a single enrolled opportunity produces up to three
 * `CommissionTransaction` rows (agent + manager override + owner
 * override), and every row repeats the *full* `saleAmount` of that
 * opportunity. Anything that reports on sale volume (as opposed to
 * commission paid out) must dedupe by `opportunityId` first, or it will
 * double/triple count. `commissionAmount`, by contrast, is a distinct
 * payment per row and should always be summed across every row.
 */

export interface MonthlyPoint {
  month: string;
  total: number;
}

export interface TopAgentRow {
  userId: string;
  firstName: string;
  lastName: string;
  opportunityCount: number;
  totalSales: number;
  totalCommission: number;
}

function monthLabel(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    year: "2-digit",
  });
}

export function countUniqueOpportunities(
  transactions: CommissionTransaction[]
): number {
  return new Set(transactions.map((tx) => tx.opportunityId)).size;
}

/** Total commission paid out across every row - each row is a distinct payment. */
export function sumCommission(transactions: CommissionTransaction[]): number {
  return transactions.reduce((sum, tx) => sum + tx.commissionAmount, 0);
}

/** Total sale value, counted once per unique opportunity (see module note above). */
export function sumUniqueSaleAmount(
  transactions: CommissionTransaction[]
): number {
  const byOpportunity = new Map<string, number>();
  for (const tx of transactions) {
    if (!byOpportunity.has(tx.opportunityId)) {
      byOpportunity.set(tx.opportunityId, tx.saleAmount);
    }
  }
  return Array.from(byOpportunity.values()).reduce((sum, amount) => sum + amount, 0);
}

interface MonthBucket {
  total: number;
  /** Timestamp used only to sort buckets chronologically, oldest first. */
  sortKey: number;
}

function toChronologicalSeries(buckets: Map<string, MonthBucket>): MonthlyPoint[] {
  return Array.from(buckets.entries())
    .sort((a, b) => a[1].sortKey - b[1].sortKey)
    .map(([month, bucket]) => ({ month, total: bucket.total }));
}

/** Monthly sale volume - deduped by opportunity, then grouped by month. */
export function buildMonthlySalesSeries(
  transactions: CommissionTransaction[]
): MonthlyPoint[] {
  const byOpportunity = new Map<string, { saleAmount: number; createdAt: string }>();
  for (const tx of transactions) {
    if (!byOpportunity.has(tx.opportunityId)) {
      byOpportunity.set(tx.opportunityId, {
        saleAmount: tx.saleAmount,
        createdAt: tx.createdAt,
      });
    }
  }

  const buckets = new Map<string, MonthBucket>();
  for (const { saleAmount, createdAt } of byOpportunity.values()) {
    const key = monthLabel(createdAt);
    const sortKey = Date.parse(createdAt);
    const existing = buckets.get(key);
    buckets.set(key, {
      total: (existing?.total ?? 0) + saleAmount,
      sortKey: existing ? Math.min(existing.sortKey, sortKey) : sortKey,
    });
  }
  return toChronologicalSeries(buckets);
}

/** Monthly commission paid out - every row counted, grouped by month. */
export function buildMonthlyCommissionSeries(
  transactions: CommissionTransaction[]
): MonthlyPoint[] {
  const buckets = new Map<string, MonthBucket>();
  for (const tx of transactions) {
    const key = monthLabel(tx.createdAt);
    const sortKey = Date.parse(tx.createdAt);
    const existing = buckets.get(key);
    buckets.set(key, {
      total: (existing?.total ?? 0) + tx.commissionAmount,
      sortKey: existing ? Math.min(existing.sortKey, sortKey) : sortKey,
    });
  }
  return toChronologicalSeries(buckets);
}

/**
 * Ranks agents by total commission earned on their own sales (role
 * `"agent"` lines only - manager/owner override rows are excluded so a
 * manager's override on their team's sales doesn't inflate their own
 * ranking here).
 */
export function buildTopAgents(
  transactions: CommissionTransaction[],
  users: AppUser[],
  limit = 5
): TopAgentRow[] {
  const userById = new Map(users.map((u) => [u.id, u]));
  const byAgent = new Map<
    string,
    { opportunities: Set<string>; totalSales: number; totalCommission: number }
  >();

  for (const tx of transactions) {
    if (tx.role !== "agent") continue;

    const entry =
      byAgent.get(tx.userId) ??
      { opportunities: new Set<string>(), totalSales: 0, totalCommission: 0 };

    if (!entry.opportunities.has(tx.opportunityId)) {
      entry.totalSales += tx.saleAmount;
      entry.opportunities.add(tx.opportunityId);
    }
    entry.totalCommission += tx.commissionAmount;
    byAgent.set(tx.userId, entry);
  }

  return Array.from(byAgent.entries())
    .map(([userId, entry]) => {
      const user = userById.get(userId);
      return {
        userId,
        firstName: user?.firstName ?? "Unknown",
        lastName: user?.lastName ?? "agent",
        opportunityCount: entry.opportunities.size,
        totalSales: entry.totalSales,
        totalCommission: entry.totalCommission,
      };
    })
    .sort((a, b) => b.totalCommission - a.totalCommission)
    .slice(0, limit);
}
