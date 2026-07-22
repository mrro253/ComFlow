import {
  listTransactionsForAgency,
  listTransactionsForUsers,
} from "@/lib/repositories/commissionTransactionRepository";
import { listDirectReports, listUsersForAgency } from "@/lib/repositories/userRepository";
import type { AppUser, CommissionTransaction } from "@/types/domain";

export interface ScopedTransactionsResult {
  transactions: CommissionTransaction[];
  /** Everyone visible to `user` in this scope - used for name lookups and
   *  headcount stats (e.g. "active agents"). Includes `user` themselves. */
  scopeUsers: AppUser[];
  scopeLabel: string;
}

/**
 * Loads commission transactions + the set of people visible to `user`,
 * following the same Owner/Manager/Agent visibility rules Row Level
 * Security enforces at the database layer (Owner: whole agency; Manager:
 * self + direct reports; Agent: self only). Centralized here so the
 * Overview, Commissions, and Users pages don't each re-implement the
 * role branching.
 */
export async function getScopedTransactions(
  user: AppUser,
  limit = 200
): Promise<ScopedTransactionsResult> {
  if (user.role === "owner") {
    const [transactions, scopeUsers] = await Promise.all([
      listTransactionsForAgency(user.agencyId, limit),
      listUsersForAgency(user.agencyId),
    ]);
    return {
      transactions,
      scopeUsers,
      scopeLabel: "Agency-wide commissions across every agent.",
    };
  }

  if (user.role === "manager") {
    const reports = await listDirectReports(user.id);
    const scopeUsers = [user, ...reports];
    const transactions = await listTransactionsForUsers(
      scopeUsers.map((u) => u.id),
      limit
    );
    return {
      transactions,
      scopeUsers,
      scopeLabel: "Commissions for you and your direct reports.",
    };
  }

  const transactions = await listTransactionsForUsers([user.id], limit);
  return {
    transactions,
    scopeUsers: [user],
    scopeLabel: "Your personal commission history.",
  };
}

export function buildNameMap(users: AppUser[]): Map<string, string> {
  return new Map(users.map((u) => [u.id, `${u.firstName} ${u.lastName}`]));
}
