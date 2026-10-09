import type { MonthlyPoint } from "@/lib/reporting/metrics";
import type { AppUser } from "@/types/domain";

/**
 * Pure aggregation over carrier transactions (what the carrier actually paid).
 * Amounts are signed integer cents: chargebacks are negative and reduce totals.
 * No database or UI imports, so these are trivially unit testable.
 */

export interface MetricTransaction {
  userId: string | null;
  /** "YYYY-MM" */
  statementMonth: string;
  /** Carrier payment category as printed (COMMISSION, RENEWAL, CHARGEBACK, ...). */
  commissionType: string;
  amountCents: number;
}

/**
 * Management-report grouping. Personal production (the owner's own writing)
 * is never mixed with agency production. Independent agents are paid directly
 * by the carrier, so they are reported separately from Career agents.
 */
export type ProducerGroup = "personal" | "career" | "independent" | "other" | "unassigned";

export const PRODUCER_GROUP_LABELS: Record<ProducerGroup, string> = {
  personal: "Owner personal production",
  career: "Career agents",
  independent: "Independent agents",
  other: "Other",
  unassigned: "Unassigned",
};

export function producerGroup(
  userId: string | null,
  usersById: ReadonlyMap<string, Pick<AppUser, "role" | "agentType">>
): ProducerGroup {
  if (userId === null) return "unassigned";
  const user = usersById.get(userId);
  if (!user) return "other";
  if (user.role === "owner") return "personal";
  if (user.agentType === "career") return "career";
  if (user.agentType === "independent") return "independent";
  return "other";
}

export function sumCents(transactions: readonly MetricTransaction[]): number {
  return transactions.reduce((sum, tx) => sum + tx.amountCents, 0);
}

export interface CategoryTotal {
  type: string;
  cents: number;
  count: number;
}

/** Totals by carrier payment category, largest absolute amount first. */
export function totalsByCategory(transactions: readonly MetricTransaction[]): CategoryTotal[] {
  const byType = new Map<string, CategoryTotal>();
  for (const tx of transactions) {
    const entry = byType.get(tx.commissionType) ?? { type: tx.commissionType, cents: 0, count: 0 };
    entry.cents += tx.amountCents;
    entry.count += 1;
    byType.set(tx.commissionType, entry);
  }
  return [...byType.values()].sort((a, b) => Math.abs(b.cents) - Math.abs(a.cents));
}

export interface GroupTotal {
  group: ProducerGroup;
  cents: number;
  count: number;
}

export function totalsByProducerGroup(
  transactions: readonly MetricTransaction[],
  usersById: ReadonlyMap<string, Pick<AppUser, "role" | "agentType">>
): GroupTotal[] {
  const byGroup = new Map<ProducerGroup, GroupTotal>();
  for (const tx of transactions) {
    const group = producerGroup(tx.userId, usersById);
    const entry = byGroup.get(group) ?? { group, cents: 0, count: 0 };
    entry.cents += tx.amountCents;
    entry.count += 1;
    byGroup.set(group, entry);
  }
  return [...byGroup.values()].sort((a, b) => Math.abs(b.cents) - Math.abs(a.cents));
}

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-09" -> "Sep 26" (matches the existing chart labels). */
export function monthLabel(statementMonth: string): string {
  const [year, month] = statementMonth.split("-");
  return `${MONTH_NAMES[Number(month) - 1] ?? month} ${year.slice(2)}`;
}

/** Carrier paid per statement month, chronological. Chart values are dollars (display only). */
export function monthlyPaidSeries(transactions: readonly MetricTransaction[]): MonthlyPoint[] {
  const byMonth = new Map<string, number>();
  for (const tx of transactions) {
    byMonth.set(tx.statementMonth, (byMonth.get(tx.statementMonth) ?? 0) + tx.amountCents);
  }
  return [...byMonth.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([month, cents]) => ({ month: monthLabel(month), total: cents / 100 }));
}

/** Most recent statement month present, or null. */
export function latestMonth(transactions: readonly MetricTransaction[]): string | null {
  let latest: string | null = null;
  for (const tx of transactions) {
    if (latest === null || tx.statementMonth > latest) latest = tx.statementMonth;
  }
  return latest;
}
