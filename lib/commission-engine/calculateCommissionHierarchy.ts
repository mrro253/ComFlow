import { calculateAgentCommission } from "@/lib/commission-engine/calculateAgentCommission";
import { calculateManagerCommission } from "@/lib/commission-engine/calculateManagerCommission";
import { calculateOwnerCommission } from "@/lib/commission-engine/calculateOwnerCommission";
import type {
  CommissionCalculationInput,
  CommissionLineResult,
} from "@/lib/commission-engine/types";

/**
 * Pure calculation across the full Owner/Manager/Agent hierarchy for a
 * single enrolled opportunity. Deliberately has no knowledge of the
 * database or any CRM - given an opportunity + the people/plan involved,
 * it returns the commission lines to persist.
 *
 * An enrolled opportunity always pays the agent, plus an override to the
 * agent's manager (if one exists) and to the agency owner. Percentages
 * come entirely from `input.plan` - specifically the rate for each role's
 * `opportunity.businessType` (new vs renewal) - never hardcoded here. See
 * `lib/commission-engine/README.md` for how plans are configured.
 */
export function calculateCommissionHierarchy(
  input: CommissionCalculationInput
): CommissionLineResult[] {
  const { opportunity, agent, manager, owner, plan } = input;
  const { saleAmount, businessType } = opportunity;

  const lines: CommissionLineResult[] = [
    {
      userId: agent.id,
      role: "agent",
      saleAmount,
      businessType,
      commissionAmount: calculateAgentCommission(
        saleAmount,
        plan.rates.agent[businessType]
      ),
    },
  ];

  if (manager) {
    lines.push({
      userId: manager.id,
      role: "manager",
      saleAmount,
      businessType,
      commissionAmount: calculateManagerCommission(
        saleAmount,
        plan.rates.manager[businessType]
      ),
    });
  }

  // The owner override applies even when the owner isn't the agent's
  // direct manager - guard against double-counting if agent === owner or
  // manager === owner (e.g. a solo agency where the owner is also selling,
  // or a small agency where the owner manages the agent directly).
  if (owner.id !== agent.id && owner.id !== manager?.id) {
    lines.push({
      userId: owner.id,
      role: "owner",
      saleAmount,
      businessType,
      commissionAmount: calculateOwnerCommission(
        saleAmount,
        plan.rates.owner[businessType]
      ),
    });
  }

  return lines;
}
