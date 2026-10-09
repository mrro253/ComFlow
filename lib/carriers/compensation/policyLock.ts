import { CAREER_LEVELS, type AgentType, type CareerLevel } from "@/types/domain";

export type SaleCategory = "T65" | "PLAN_CHANGE";
export type CarrierPaymentCategory = SaleCategory | "RENEWAL";

/** Effective-dated pay rule (row of `compensation_rules`). Amounts are integer cents. */
export interface CompensationRule {
  id: string;
  agentType: AgentType;
  careerLevel: CareerLevel | null;
  product: string;
  commissionType: string;
  calculationMethod: "FIXED" | "PERCENT";
  rateCents: number | null;
  ratePercent: number | null;
  status: "ACTIVE" | "NOT_CONFIGURED";
  /** ISO "YYYY-MM-DD" */
  effectiveFrom: string;
  effectiveTo: string | null;
}

/** Human-verified facts about a policy at the moment it was written. */
export interface PolicyLockInput {
  carrier: string;
  /** Exact enrollment/version key. A member id alone does not identify a policy version. */
  policyKey: string;
  memberId: string;
  agentId: string;
  writtenDate: string;
  careerLevelAtWrite: CareerLevel;
  saleCategory: SaleCategory;
  verified: boolean;
  evidenceReference: string;
}

/**
 * Immutable snapshot of the rates in force when a policy was written. A later
 * promotion or rule change never alters it, which is how "promotions only
 * affect new business" is enforced.
 */
export interface PolicyLock {
  carrier: string;
  policyKey: string;
  carrierMemberId: string;
  agentId: string;
  product: "MAPD";
  writtenDate: string;
  careerLevelAtWrite: CareerLevel;
  saleCategory: SaleCategory;
  saleRateCents: number;
  renewalRateCents: number;
  saleRuleId: string;
  renewalRuleId: string;
  evidenceReference: string;
}

export interface LockAgent {
  id: string;
  agentType: AgentType | null;
}

export function assertIsoDate(value: unknown): string {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value
  ) {
    throw new Error("Verified ISO written date required");
  }
  return value;
}

function findFixedRateCents(
  rules: readonly CompensationRule[],
  level: CareerLevel,
  commissionType: string,
  onDate: string
): { id: string; cents: number } {
  const matches = rules.filter(
    (rule) =>
      rule.agentType === "career" &&
      rule.careerLevel === level &&
      rule.product === "MAPD" &&
      rule.commissionType === commissionType &&
      rule.calculationMethod === "FIXED" &&
      rule.status === "ACTIVE" &&
      rule.effectiveFrom <= onDate &&
      (rule.effectiveTo === null || rule.effectiveTo >= onDate)
  );
  if (matches.length !== 1) {
    throw new Error("Missing or overlapping effective commission rules; review required");
  }
  const { id, rateCents } = matches[0];
  if (rateCents === null || !Number.isSafeInteger(rateCents) || rateCents < 0) {
    throw new Error("Invalid fixed-dollar rate");
  }
  return { id, cents: rateCents };
}

function sameIdentity(existing: PolicyLock, input: PolicyLockInput): boolean {
  return (
    existing.carrierMemberId === input.memberId &&
    existing.agentId === input.agentId &&
    existing.writtenDate === input.writtenDate &&
    existing.careerLevelAtWrite === input.careerLevelAtWrite &&
    existing.saleCategory === input.saleCategory &&
    existing.evidenceReference === input.evidenceReference
  );
}

/**
 * Validates verified policy evidence and snapshots the matching rates. Pure:
 * persisting the returned lock (insert-only, enforced by a database trigger) is
 * the caller's job. Replaying identical input returns the existing lock; any
 * conflicting replay throws.
 */
export function buildPolicyLock(
  input: PolicyLockInput,
  context: {
    agent: LockAgent | undefined;
    rules: readonly CompensationRule[];
    existing?: PolicyLock;
  }
): PolicyLock {
  if (input.verified !== true) {
    throw new Error("Verified historical writing-agent and tier evidence required");
  }
  const writtenDate = assertIsoDate(input.writtenDate);
  if (
    !CAREER_LEVELS.includes(input.careerLevelAtWrite) ||
    !["T65", "PLAN_CHANGE"].includes(input.saleCategory)
  ) {
    throw new Error("Unsupported tier or sale category");
  }
  for (const key of ["carrier", "policyKey", "memberId", "evidenceReference"] as const) {
    if (typeof input[key] !== "string" || !input[key].trim()) {
      throw new Error("Policy identity and evidence reference required");
    }
  }
  if (!context.agent || context.agent.id !== input.agentId || context.agent.agentType !== "career") {
    throw new Error("Only Career agent policies receive compensation locks");
  }

  if (context.existing) {
    if (!sameIdentity(context.existing, { ...input, writtenDate })) {
      throw new Error("Policy identity or historical tier conflicts with immutable lock");
    }
    return context.existing;
  }

  const sale = findFixedRateCents(
    context.rules,
    input.careerLevelAtWrite,
    input.saleCategory,
    writtenDate
  );
  const renewal = findFixedRateCents(context.rules, input.careerLevelAtWrite, "RENEWAL", writtenDate);

  return {
    carrier: input.carrier,
    policyKey: input.policyKey,
    carrierMemberId: input.memberId,
    agentId: input.agentId,
    product: "MAPD",
    writtenDate,
    careerLevelAtWrite: input.careerLevelAtWrite,
    saleCategory: input.saleCategory,
    saleRateCents: sale.cents,
    renewalRateCents: renewal.cents,
    saleRuleId: sale.id,
    renewalRuleId: renewal.id,
    evidenceReference: input.evidenceReference,
  };
}

/** The slice of a ledger transaction that payment quoting needs. */
export interface PaymentForQuote {
  id: string;
  userId: string | null;
  carrier: string;
  memberId: string;
  amountCents: number;
  statementMonth: string;
  commissionType: string;
  /** Production category of the row; personal production never earns Career pay. */
  entityType: "agency" | "personal" | null;
}

export type PaymentQuote =
  | {
      status: "quoted";
      category: CarrierPaymentCategory;
      earnedAmountCents: number;
      carrierTransactionId: string;
    }
  | { status: "review"; reason: string };

/**
 * Read-only preview: what a carrier payment would earn under a policy lock.
 * Never creates an earning or authorizes a payout. The carrier's printed
 * category decides the quote; a generic COMMISSION label or the dollar amount is
 * never used to guess T65 vs plan change.
 */
export function quoteCareerPayment(lock: PolicyLock, payment: PaymentForQuote): PaymentQuote {
  const review = (reason: string): PaymentQuote => ({ status: "review", reason });

  if (
    payment.entityType === "personal" ||
    payment.userId !== lock.agentId ||
    payment.carrier !== lock.carrier ||
    payment.memberId !== lock.carrierMemberId
  ) {
    return review("Carrier payment does not match Career policy ownership");
  }
  if (!Number.isSafeInteger(payment.amountCents) || payment.amountCents <= 0) {
    return review("Zero, negative, or chargeback payments require separate rules");
  }
  if (
    !/^\d{4}-(0[1-9]|1[0-2])$/.test(payment.statementMonth) ||
    payment.statementMonth < lock.writtenDate.slice(0, 7)
  ) {
    return review("Payment predates policy or has invalid period");
  }
  if (payment.commissionType === "RENEWAL") {
    return {
      status: "quoted",
      category: "RENEWAL",
      earnedAmountCents: lock.renewalRateCents,
      carrierTransactionId: payment.id,
    };
  }
  if (payment.commissionType !== lock.saleCategory) {
    return review("Carrier sale category does not match verified policy; never infer from COMMISSION or amount");
  }
  return {
    status: "quoted",
    category: lock.saleCategory,
    earnedAmountCents: lock.saleRateCents,
    carrierTransactionId: payment.id,
  };
}
