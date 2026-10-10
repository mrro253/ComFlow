import type { AppUser } from "@/types/domain";
import type {
  CommissionCalculationInput,
  CommissionPlanConfig,
  NormalizedOpportunity,
} from "@/lib/commission-engine/types";

/**
 * Shared fixtures for commission-engine tests and for manually exercising
 * the engine (e.g. from a scratch script or the Node REPL). Mirrors the
 * demo agency in `supabase/seed.sql` so numbers are easy to cross-check.
 */

export const samplePlan: CommissionPlanConfig = {
  id: "55555555-5555-5555-5555-555555555555",
  name: "Standard Plan",
  rates: {
    agent: { new: 10, renewal: 5 },
    manager: { new: 2, renewal: 1 },
    owner: { new: 1, renewal: 1 },
  },
};

export const sampleOwner: AppUser = {
  id: "22222222-2222-2222-2222-222222222222",
  agencyId: "11111111-1111-1111-1111-111111111111",
  firstName: "Jane",
  lastName: "Owner",
  email: "owner@commissionflow.dev",
  role: "owner",
  agentType: null,
  careerLevel: null,
  active: true,
  managerId: null,
  commissionPlanId: null,
  payeeId: null,
  principalId: null,
  createdAt: "2026-01-01T00:00:00.000Z",
};

export const sampleManager: AppUser = {
  id: "33333333-3333-3333-3333-333333333333",
  agencyId: "11111111-1111-1111-1111-111111111111",
  firstName: "Mike",
  lastName: "Manager",
  email: "manager@commissionflow.dev",
  role: "manager",
  agentType: null,
  careerLevel: null,
  active: true,
  managerId: null,
  commissionPlanId: null,
  payeeId: null,
  principalId: null,
  createdAt: "2026-01-01T00:00:00.000Z",
};

export const sampleAgent: AppUser = {
  id: "44444444-4444-4444-4444-444444444444",
  agencyId: "11111111-1111-1111-1111-111111111111",
  firstName: "Alex",
  lastName: "Agent",
  email: "agent@commissionflow.dev",
  role: "agent",
  agentType: null,
  careerLevel: null,
  active: true,
  managerId: sampleManager.id,
  commissionPlanId: null,
  payeeId: null,
  principalId: null,
  createdAt: "2026-01-01T00:00:00.000Z",
};

/** Agent with no manager assigned - exercises the "solo agent" path. */
export const sampleUnmanagedAgent: AppUser = {
  ...sampleAgent,
  id: "66666666-6666-6666-6666-666666666666",
  email: "solo-agent@commissionflow.dev",
  managerId: null,
};

/** A handful of enrolled opportunities matching `supabase/seed.sql`. */
export const sampleOpportunities: NormalizedOpportunity[] = [
  {
    opportunityId: "OPP-1001",
    agencyId: sampleAgent.agencyId,
    agentUserId: sampleAgent.id,
    stage: "Enrolled",
    saleAmount: 3200,
    businessType: "new",
  },
  {
    opportunityId: "OPP-1014",
    agencyId: sampleAgent.agencyId,
    agentUserId: sampleAgent.id,
    stage: "Enrolled",
    saleAmount: 4800,
    businessType: "new",
  },
  {
    opportunityId: "OPP-1027",
    agencyId: sampleAgent.agencyId,
    agentUserId: sampleAgent.id,
    stage: "Enrolled",
    saleAmount: 2650,
    businessType: "renewal",
  },
];

/** A full calculation input for the "agent with a manager" happy path. */
export const sampleCalculationInput: CommissionCalculationInput = {
  opportunity: sampleOpportunities[0],
  agent: sampleAgent,
  manager: sampleManager,
  owner: sampleOwner,
  plan: samplePlan,
};

/** A full calculation input for a solo agent with no manager assigned. */
export const sampleUnmanagedCalculationInput: CommissionCalculationInput = {
  opportunity: {
    ...sampleOpportunities[0],
    agentUserId: sampleUnmanagedAgent.id,
  },
  agent: sampleUnmanagedAgent,
  manager: null,
  owner: sampleOwner,
  plan: samplePlan,
};

/** Edge case: the owner is also the selling agent (solo-owner agency). */
export const sampleOwnerAsAgentCalculationInput: CommissionCalculationInput = {
  opportunity: {
    ...sampleOpportunities[0],
    agentUserId: sampleOwner.id,
  },
  agent: sampleOwner,
  manager: null,
  owner: sampleOwner,
  plan: samplePlan,
};
