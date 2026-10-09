import { digest } from "@/lib/carriers/digest";
import {
  buildPolicyLock,
  type CarrierPaymentCategory,
  type CompensationRule,
  type LockAgent,
  type PolicyLock,
  type PolicyLockInput,
} from "@/lib/carriers/compensation/policyLock";
import type { AgentType } from "@/types/domain";

/** A reviewer-verified link between one carrier payment and an exact policy version. */
export interface PaymentMapping {
  carrierTransactionId: string;
  policyKey: string;
  category: CarrierPaymentCategory;
  /** Coverage month the carrier paid for ("YYYY-MM"). Required for renewals. */
  renewalMonth?: string;
  verified: boolean;
  evidenceReference: string;
}

export interface EarningsInput {
  policies: PolicyLockInput[];
  payments: PaymentMapping[];
}

/** Ledger row plus the matched agent's classification. */
export interface LedgerTransaction {
  id: string;
  userId: string | null;
  agentType: AgentType | null;
  entityType: "agency" | "personal" | null;
  carrier: string;
  memberId: string;
  amountCents: number;
  statementMonth: string;
  commissionType: string;
}

export interface ExistingEarning {
  id: string;
  userId: string;
  carrierTransactionId: string;
  earnedAmountCents: number;
}

export interface ExistingEarningSource {
  carrierTransactionId: string;
  earningId: string;
  earningKey: string;
  sourceSignature: string;
}

/** Everything the planner reads. All of it is plain data loaded by the caller. */
export interface EarningsContext {
  transactions: readonly LedgerTransaction[];
  agents: readonly LockAgent[];
  rules: readonly CompensationRule[];
  locks: readonly PolicyLock[];
  sources: readonly ExistingEarningSource[];
  earnings: readonly ExistingEarning[];
}

export type EarningRowStatus = "new" | "existing" | "review";

export interface EarningPlanRow {
  transactionId: string;
  status: EarningRowStatus;
  reason?: string;
  userId?: string;
  policyKey?: string;
  category?: CarrierPaymentCategory;
  renewalMonth?: string | null;
  amountCents?: number;
  earningKey?: string;
  sourceSignature?: string;
  evidenceReference?: string;
}

export interface EarningsPlanSummary {
  newEarnings: number;
  existingEarnings: number;
  reviewRows: number;
  excludedTransactions: number;
  netNewCents: number;
}

export interface EarningsPlan {
  input: EarningsInput;
  rows: EarningPlanRow[];
  /** Policy locks the apply step must insert (policies not already locked). */
  newLocks: PolicyLock[];
  errors: string[];
  summary: EarningsPlanSummary;
  /** Fingerprint of everything the plan depends on; must match at approval time. */
  signature: string;
  ready: boolean;
}

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const PAYMENT_CATEGORIES: readonly string[] = ["T65", "PLAN_CHANGE", "RENEWAL"];
const SALE_OR_GENERIC: readonly string[] = ["COMMISSION", "INITIAL", "T65", "PLAN_CHANGE", "RENEWAL"];
const GENERIC_SALE: readonly string[] = ["COMMISSION", "INITIAL"];

const lockKey = (carrier: string, policyKey: string): string => JSON.stringify([carrier, policyKey]);

function resolveLocks(
  input: EarningsInput,
  context: EarningsContext,
  errors: string[]
): { locks: Map<string, PolicyLock>; newLocks: PolicyLock[] } {
  const agents = new Map(context.agents.map((agent) => [agent.id, agent]));
  const persisted = new Map(context.locks.map((lock) => [lockKey(lock.carrier, lock.policyKey), lock]));
  const locks = new Map<string, PolicyLock>();
  const newLocks: PolicyLock[] = [];

  for (const policy of input.policies) {
    const key = lockKey(policy.carrier, policy.policyKey);
    try {
      if (locks.has(key)) throw new Error("Repeated policy input");
      const existing = persisted.get(key);
      const lock = buildPolicyLock(policy, {
        agent: agents.get(policy.agentId),
        rules: context.rules,
        existing,
      });
      locks.set(key, lock);
      if (!existing) newLocks.push(lock);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "Invalid policy input");
    }
  }
  return { locks, newLocks };
}

/**
 * Read-only preview of the earnings that verified evidence would create for
 * Career Agents. Writes nothing. Personal and Independent production is
 * excluded entirely (the carrier pays it directly, so no agency obligation
 * exists). Anything unverified, ambiguous, negative or duplicated becomes a
 * review row that blocks the whole batch.
 */
export function buildEarningsPlan(input: EarningsInput, context: EarningsContext): EarningsPlan {
  if (!Array.isArray(input.policies) || !Array.isArray(input.payments)) {
    throw new Error("Policies and payments arrays required");
  }

  const errors: string[] = [];
  const { locks, newLocks } = resolveLocks(input, context, errors);
  const persistedLocks = new Map(context.locks.map((lock) => [lockKey(lock.carrier, lock.policyKey), lock]));

  const evidence = new Map<string, PaymentMapping>();
  for (const mapping of input.payments) {
    if (evidence.has(mapping.carrierTransactionId)) errors.push("Repeated payment mapping");
    evidence.set(mapping.carrierTransactionId, mapping);
  }

  const rows: EarningPlanRow[] = [];
  const claimedKeys = new Map<string, EarningPlanRow>();
  let excluded = 0;

  for (const tx of context.transactions) {
    if (tx.entityType === "personal" || tx.agentType === "independent") {
      excluded++;
      continue;
    }
    const review = (reason: string) => rows.push({ transactionId: tx.id, status: "review", reason });

    if (tx.agentType !== "career" || tx.userId === null) {
      review("Writing agent is not verified as Career");
      continue;
    }

    const match = evidence.get(tx.id);
    if (!match || match.verified !== true || typeof match.evidenceReference !== "string" || !match.evidenceReference.trim()) {
      review("Verified carrier category and policy-version evidence required");
      continue;
    }

    const policy =
      locks.get(lockKey(tx.carrier, match.policyKey)) ??
      persistedLocks.get(lockKey(tx.carrier, match.policyKey));
    if (!policy || policy.agentId !== tx.userId || policy.carrierMemberId !== tx.memberId) {
      review("Payment does not match exact locked policy ownership");
      continue;
    }

    const category = match.category;
    const categoryConflict =
      !PAYMENT_CATEGORIES.includes(category) ||
      !SALE_OR_GENERIC.includes(tx.commissionType) ||
      (PAYMENT_CATEGORIES.includes(tx.commissionType) && tx.commissionType !== category) ||
      (GENERIC_SALE.includes(tx.commissionType) && category === "RENEWAL");
    if (categoryConflict) {
      review("Unsupported or conflicting carrier payment category");
      continue;
    }
    if (!Number.isSafeInteger(tx.amountCents) || tx.amountCents <= 0) {
      review("Nonpositive carrier payment requires separate chargeback or adjustment rules");
      continue;
    }
    if (!MONTH.test(tx.statementMonth) || tx.statementMonth < policy.writtenDate.slice(0, 7)) {
      review("Carrier payment period predates policy");
      continue;
    }

    let renewalMonth: string | null = null;
    if (category === "RENEWAL") {
      renewalMonth = match.renewalMonth ?? null;
      if (
        renewalMonth === null ||
        !MONTH.test(renewalMonth) ||
        renewalMonth < policy.writtenDate.slice(0, 7) ||
        renewalMonth > tx.statementMonth
      ) {
        review("Verified carrier renewal coverage month required");
        continue;
      }
    } else if (category !== policy.saleCategory) {
      review("Sale category differs from locked enrollment");
      continue;
    }

    const amountCents = category === "RENEWAL" ? policy.renewalRateCents : policy.saleRateCents;
    // One sale per locked enrollment; one renewal per member/agent/coverage month.
    const earningKey = digest(
      category === "RENEWAL"
        ? ["renewal", tx.carrier, tx.memberId, tx.userId, renewalMonth]
        : ["sale", tx.carrier, policy.policyKey]
    );
    const sourceSignature = digest({ tx, policy, match, amountCents, earningKey });

    const priorSources = context.sources.filter(
      (source) => source.carrierTransactionId === tx.id || source.earningKey === earningKey
    );
    const priorEarnings = context.earnings.filter((earning) => earning.carrierTransactionId === tx.id);

    let status: EarningRowStatus = "new";
    let reason: string | undefined;
    if (priorSources.length) {
      const [source] = priorSources;
      const [earning] = priorEarnings;
      const unchanged =
        priorSources.length === 1 &&
        source.carrierTransactionId === tx.id &&
        source.sourceSignature === sourceSignature &&
        priorEarnings.length === 1 &&
        earning.id === source.earningId &&
        earning.userId === tx.userId &&
        earning.earnedAmountCents === amountCents;
      if (unchanged) {
        status = "existing";
      } else {
        status = "review";
        reason = "Repeated entitlement or changed source conflicts with existing earning";
      }
    } else if (priorEarnings.length) {
      status = "review";
      reason = "Existing commission lacks matching policy provenance";
    }

    const row: EarningPlanRow = {
      transactionId: tx.id,
      status,
      userId: tx.userId,
      policyKey: policy.policyKey,
      category,
      renewalMonth,
      amountCents,
      earningKey,
      sourceSignature,
      evidenceReference: match.evidenceReference,
      ...(reason ? { reason } : {}),
    };

    const firstClaim = claimedKeys.get(earningKey);
    if (firstClaim) {
      const conflict = "Multiple carrier rows claim the same monthly renewal or sale";
      row.status = "review";
      row.reason = conflict;
      firstClaim.status = "review";
      firstClaim.reason = conflict;
    } else {
      claimedKeys.set(earningKey, row);
    }
    rows.push(row);
  }

  const eligible = new Set(
    context.transactions
      .filter((tx) => tx.agentType === "career" && tx.entityType !== "personal")
      .map((tx) => tx.id)
  );
  for (const id of evidence.keys()) {
    if (!eligible.has(id)) {
      errors.push(`Payment mapping does not identify an eligible Career transaction: ${id}`);
    }
  }

  const newRows = rows.filter((row) => row.status === "new");
  const summary: EarningsPlanSummary = {
    newEarnings: newRows.length,
    existingEarnings: rows.filter((row) => row.status === "existing").length,
    reviewRows: rows.filter((row) => row.status === "review").length,
    excludedTransactions: excluded,
    netNewCents: newRows.reduce((sum, row) => sum + (row.amountCents ?? 0), 0),
  };

  const signature = digest({
    input,
    errors,
    rows: rows.map(({ status: _status, reason: _reason, ...rest }) => rest),
  });

  return {
    input,
    rows,
    newLocks,
    errors,
    summary,
    signature,
    ready: errors.length === 0 && summary.reviewRows === 0,
  };
}

/**
 * Approval guard: a reviewed plan may only be applied if a freshly rebuilt plan
 * is ready and has the identical signature. If any source changed between
 * review and approval, the whole batch is refused.
 */
export function assertReviewedPlanStillValid(reviewed: EarningsPlan, fresh: EarningsPlan): void {
  if (!fresh.ready || !reviewed.ready || fresh.signature !== reviewed.signature) {
    throw new Error("Plan changed or needs review; regenerate preview");
  }
}
