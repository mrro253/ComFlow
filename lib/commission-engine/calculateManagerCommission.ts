import { roundCurrency } from "@/lib/commission-engine/roundCurrency";

/**
 * The override paid to the agent's manager on an enrolled opportunity.
 * Only applies when the agent actually has a manager - callers should
 * skip invoking this (see `calculateCommissionHierarchy`) rather than
 * pass a manager percent of 0.
 *
 * Example: saleAmount=1000, managerPercent=2 -> 20
 */
export function calculateManagerCommission(
  saleAmount: number,
  managerPercent: number
): number {
  return roundCurrency(saleAmount * (managerPercent / 100));
}
