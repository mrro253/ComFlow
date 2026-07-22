import { roundCurrency } from "@/lib/commission-engine/roundCurrency";

/**
 * The selling agent's commission on an enrolled opportunity.
 *
 * `agentPercent` always comes from the agency's `CommissionPlan` (see
 * `lib/repositories/commissionPlanRepository.ts`) - never hardcode a
 * percentage when calling this function.
 *
 * Example: saleAmount=1000, agentPercent=10 -> 100
 */
export function calculateAgentCommission(
  saleAmount: number,
  agentPercent: number
): number {
  return roundCurrency(saleAmount * (agentPercent / 100));
}
