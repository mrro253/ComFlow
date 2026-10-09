/**
 * Domain-level types shared across the UI, business logic, and repository
 * layers. These are hand-mapped from the `public` schema (see
 * `types/database.ts`) into friendlier camelCase shapes for app code.
 */

export type Role = "owner" | "manager" | "agent";

export const ROLES: Role[] = ["owner", "manager", "agent"];

/**
 * How a producer is paid. Career Agents are paid by the agency from
 * compensation rules; Independent Agents are paid 100% directly by the
 * carrier and are only tracked.
 */
export type AgentType = "career" | "independent";

export const AGENT_TYPES: AgentType[] = ["career", "independent"];

/** Career Agent tiers, lowest to highest. */
export const CAREER_LEVELS = [
  "Benefit Consultant",
  "Senior Benefit Consultant",
  "Client Advisor",
  "Private Client Advisor",
] as const;

export type CareerLevel = (typeof CAREER_LEVELS)[number];

/** "agency" = a company with its own Career Agents; "individual" = one Independent Agent. */
export type AccountType = "agency" | "individual";

export interface AppUser {
  id: string;
  agencyId: string;
  firstName: string;
  lastName: string;
  email: string;
  role: Role;
  /** Null for users who are not producers (e.g. an Owner who does not write business). */
  agentType: AgentType | null;
  /** Set if and only if `agentType` is "career". */
  careerLevel: CareerLevel | null;
  active: boolean;
  managerId: string | null;
  /** Explicit plan assignment; falls back to the agency's default plan when null. */
  commissionPlanId: string | null;
  createdAt: string;
}

export interface Agency {
  id: string;
  name: string;
  accountType: AccountType;
  /** Null until the Owner finishes or dismisses the onboarding checklist (see app/(dashboard)/onboarding). */
  onboardingCompletedAt: string | null;
  createdAt: string;
}

/** Distinguishes a first-time sale from a renewal - each can carry its own rate. */
export type BusinessType = "new" | "renewal";

export const BUSINESS_TYPES: BusinessType[] = ["new", "renewal"];

/** A named commission plan. Rates and bonuses live in separate tables
 *  (see `CommissionPlanRate` / `CommissionPlanBonus`) so a plan can hold
 *  different numbers per role x business type without flat columns. */
export interface CommissionPlan {
  id: string;
  agencyId: string;
  name: string;
  /** Archived plans can't be newly assigned but stay attached to historical transactions. */
  active: boolean;
  /** The plan used for any user with no explicit `commissionPlanId`. Exactly one per agency. */
  isDefault: boolean;
  createdAt: string;
}

/** Which override tier a given commission line represents. `bonus` is a
 *  one-off payout row, not tied to a specific opportunity's sale. */
export type CommissionRole = "agent" | "manager" | "owner" | "bonus";

export interface CommissionPlanRate {
  id: string;
  agencyId: string;
  commissionPlanId: string;
  role: CommissionRole;
  businessType: BusinessType;
  percent: number;
  createdAt: string;
}

/** A flat $ bonus awarded once a role hits N enrollments in a calendar month. */
export interface CommissionPlanBonus {
  id: string;
  agencyId: string;
  commissionPlanId: string;
  role: CommissionRole;
  thresholdCount: number;
  bonusAmount: number;
  createdAt: string;
}

/** A plan bundled with its rates/bonuses - the shape most UI and the
 *  commission engine actually want to work with. */
export interface CommissionPlanWithDetails extends CommissionPlan {
  rates: CommissionPlanRate[];
  bonuses: CommissionPlanBonus[];
}

/** Records that a bonus has been paid for a given person in a given month,
 *  so the same bonus can never be awarded twice for the same period. */
export interface CommissionBonusAward {
  id: string;
  agencyId: string;
  commissionPlanBonusId: string;
  userId: string;
  /** Calendar month the bonus was earned in, e.g. "2026-07". */
  period: string;
  commissionTransactionId: string | null;
  awardedAt: string;
}

export interface CommissionTransaction {
  id: string;
  agencyId: string;
  userId: string;
  opportunityId: string;
  role: CommissionRole;
  businessType: BusinessType;
  saleAmount: number;
  commissionAmount: number;
  commissionPlanId: string | null;
  createdAt: string;
}

/** CRM provider identifiers. Only "gohighlevel" is implemented for MVP. */
export type CRMProviderId = "gohighlevel";

export interface CRMConnection {
  id: string;
  agencyId: string;
  provider: CRMProviderId;
  accessToken: string | null;
  refreshToken: string | null;
  lastSyncAt: string | null;
  createdAt: string;
}

/** Session user merged with their `public.users` profile row. */
export interface CurrentUser extends AppUser {
  authUserId: string;
}
