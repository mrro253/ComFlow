import { createClient, type TypedSupabaseClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";
import type { CommissionTransaction } from "@/types/domain";

type TransactionRow =
  Database["public"]["Tables"]["commission_transactions"]["Row"];
type TransactionInsert =
  Database["public"]["Tables"]["commission_transactions"]["Insert"];

function mapTransactionRow(row: TransactionRow): CommissionTransaction {
  return {
    id: row.id,
    agencyId: row.agency_id,
    userId: row.user_id,
    opportunityId: row.opportunity_id,
    role: row.role,
    businessType: row.business_type,
    saleAmount: Number(row.sale_amount),
    commissionAmount: Number(row.commission_amount),
    commissionPlanId: row.commission_plan_id,
    createdAt: row.created_at,
  };
}

export async function insertCommissionTransactions(
  lines: Omit<CommissionTransaction, "id" | "createdAt">[],
  client?: TypedSupabaseClient
): Promise<CommissionTransaction[]> {
  const supabase = client ?? (await createClient());
  const rows: TransactionInsert[] = lines.map((line) => ({
    agency_id: line.agencyId,
    user_id: line.userId,
    opportunity_id: line.opportunityId,
    role: line.role,
    business_type: line.businessType,
    sale_amount: line.saleAmount,
    commission_amount: line.commissionAmount,
    commission_plan_id: line.commissionPlanId,
  }));

  const { data, error } = await supabase
    .from("commission_transactions")
    .insert(rows)
    .select("*");

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to insert commission transactions");
  }
  return data.map(mapTransactionRow);
}

/** Owner view: every commission transaction for the agency. */
export async function listTransactionsForAgency(
  agencyId: string,
  limit = 50
): Promise<CommissionTransaction[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("commission_transactions")
    .select("*")
    .eq("agency_id", agencyId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error || !data) return [];
  return data.map(mapTransactionRow);
}

/** Manager/Agent view: commission transactions for a specific set of users. */
export async function listTransactionsForUsers(
  userIds: string[],
  limit = 50
): Promise<CommissionTransaction[]> {
  if (userIds.length === 0) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("commission_transactions")
    .select("*")
    .in("user_id", userIds)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error || !data) return [];
  return data.map(mapTransactionRow);
}

/**
 * Counts a user's enrollments (commission lines) for a given role within a
 * calendar month - the input to bonus threshold checks. `period` is a
 * "YYYY-MM" string; each enrolled opportunity produces exactly one row per
 * role, so counting rows is equivalent to counting opportunities.
 */
export async function countEnrollmentsForUserInPeriod(
  userId: string,
  role: "agent" | "manager" | "owner",
  period: string
): Promise<number> {
  const { start, end } = periodToDateRange(period);
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("commission_transactions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("role", role)
    .gte("created_at", start)
    .lt("created_at", end);

  if (error) return 0;
  return count ?? 0;
}

/** "2026-07" -> the UTC start/end-exclusive bounds of that calendar month. */
function periodToDateRange(period: string): { start: string; end: string } {
  const [year, month] = period.split("-").map(Number);
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 1));
  return { start: start.toISOString(), end: end.toISOString() };
}

/** The calendar month (UTC) a given date falls in, as "YYYY-MM". */
export function dateToPeriod(date: Date = new Date()): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}
