import { roundCurrency } from "@/lib/commission-engine/roundCurrency";

/**
 * The override paid to the agency owner on every enrolled opportunity,
 * regardless of who the selling agent's manager is.
 *
 * Example: saleAmount=1000, ownerPercent=1 -> 10
 */
export function calculateOwnerCommission(
  saleAmount: number,
  ownerPercent: number
): number {
  return roundCurrency(saleAmount * (ownerPercent / 100));
}
