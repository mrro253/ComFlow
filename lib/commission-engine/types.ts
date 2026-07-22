import type { AppUser, BusinessType, CommissionRole } from "@/types/domain";

/** CRM-agnostic representation of a sales opportunity. Populated by a CRM adapter. */
export interface NormalizedOpportunity {
  opportunityId: string;
  agencyId: string;
  /** The `public.users.id` of the agent who owns this opportunity. */
  agentUserId: string;
  stage: string;
  saleAmount: number;
  /** Defaults to "new" in adapters that can't yet detect renewals. */
  businessType: BusinessType;
}

/** A percent for each side of the new-vs-renewal split. */
export interface RatePair {
  new: number;
  renewal: number;
}

/**
 * Flattened view of a `CommissionPlanWithDetails` the calculators can index
 * straight into: `plan.rates.agent[businessType]`. Built by
 * `lib/repositories/commissionPlanRepository.ts` from the normalized
 * `commission_plan_rates` rows - never hardcode a percentage when calling
 * these functions.
 */
export interface CommissionPlanConfig {
  id: string;
  name: string;
  rates: {
    agent: RatePair;
    manager: RatePair;
    owner: RatePair;
  };
}

export interface CommissionLineResult {
  userId: string;
  role: CommissionRole;
  saleAmount: number;
  commissionAmount: number;
  businessType: BusinessType;
}

export interface CommissionCalculationInput {
  opportunity: NormalizedOpportunity;
  agent: AppUser;
  /** The agent's manager, if any. */
  manager: AppUser | null;
  /** The agency owner, who receives an override on every enrolled sale. */
  owner: AppUser;
  plan: CommissionPlanConfig;
}

/** The CRM stage that triggers commission generation. Kept as a constant so
 *  it's defined once and never duplicated/hardcoded elsewhere. */
export const ENROLLED_STAGE = "Enrolled";
