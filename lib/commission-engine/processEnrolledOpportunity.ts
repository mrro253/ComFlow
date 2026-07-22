import { calculateCommissionHierarchy } from "@/lib/commission-engine/calculateCommissionHierarchy";
import {
  ENROLLED_STAGE,
  type NormalizedOpportunity,
} from "@/lib/commission-engine/types";
import { resolvePlanConfigForAgent } from "@/lib/repositories/commissionPlanRepository";
import { insertCommissionTransactions } from "@/lib/repositories/commissionTransactionRepository";
import {
  getAgencyOwner,
  getUserById,
} from "@/lib/repositories/userRepository";
import type { TypedSupabaseClient } from "@/lib/supabase/server";
import type { CommissionTransaction } from "@/types/domain";

/**
 * Use-case entrypoint: called whenever a CRM adapter reports that an
 * opportunity has reached the "Enrolled" stage. Loads the people/plan
 * involved, runs the pure calculation, and persists the resulting
 * commission transactions.
 *
 * The plan used is whichever one the selling agent is assigned to
 * (`agent.commissionPlanId`), falling back to the agency's default plan -
 * that single plan's rates govern the agent's cut *and* the manager/owner
 * overrides on this sale (see `resolvePlanConfigForAgent`).
 *
 * `client` lets callers without a user session (CRM webhooks) pass the
 * admin/service-role client, since there's no RLS-authenticated user in
 * that context. Server actions/routes running on behalf of a signed-in
 * user can omit it to use the session-scoped client + RLS.
 *
 * Returns `null` (no-op) if the opportunity isn't Enrolled or the agent
 * has no resolvable commission plan (no assignment and no agency default).
 */
export async function processEnrolledOpportunity(
  opportunity: NormalizedOpportunity,
  client?: TypedSupabaseClient
): Promise<CommissionTransaction[] | null> {
  if (opportunity.stage !== ENROLLED_STAGE) {
    return null;
  }

  const [agent, owner] = await Promise.all([
    getUserById(opportunity.agentUserId, client),
    getAgencyOwner(opportunity.agencyId, client),
  ]);

  if (!agent || !owner) {
    // TODO: surface this as a sync error in a future "CRM sync log" view
    // rather than silently dropping the opportunity.
    return null;
  }

  const plan = await resolvePlanConfigForAgent(
    opportunity.agencyId,
    agent.commissionPlanId,
    client
  );

  if (!plan) {
    // TODO: surface this as a sync error in a future "CRM sync log" view
    // rather than silently dropping the opportunity.
    return null;
  }

  const manager = agent.managerId
    ? await getUserById(agent.managerId, client)
    : null;

  const lines = calculateCommissionHierarchy({
    opportunity,
    agent,
    manager,
    owner,
    plan,
  });

  return insertCommissionTransactions(
    lines.map((line) => ({
      agencyId: opportunity.agencyId,
      userId: line.userId,
      opportunityId: opportunity.opportunityId,
      role: line.role,
      businessType: line.businessType,
      saleAmount: line.saleAmount,
      commissionAmount: line.commissionAmount,
      commissionPlanId: plan.id,
    })),
    client
  );
}
