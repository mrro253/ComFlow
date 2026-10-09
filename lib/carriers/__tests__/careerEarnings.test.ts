import { describe, expect, it } from "vitest";
import {
  assertReviewedPlanStillValid,
  buildEarningsPlan,
  type EarningsContext,
  type EarningsInput,
  type LedgerTransaction,
} from "@/lib/carriers/compensation/careerEarnings";
import {
  CAREER_AGENT,
  INDEPENDENT_AGENT,
  POLICY_INPUT,
  mapdRules,
} from "@/lib/carriers/__fixtures__/compensation";

function tx(overrides: Partial<LedgerTransaction> & Pick<LedgerTransaction, "id">): LedgerTransaction {
  return {
    userId: CAREER_AGENT.id,
    agentType: "career",
    entityType: "agency",
    carrier: "Test Carrier",
    memberId: "member-1",
    amountCents: 50000,
    statementMonth: "2026-10",
    commissionType: "COMMISSION",
    ...overrides,
  };
}

function context(overrides: Partial<EarningsContext> = {}): EarningsContext {
  return {
    transactions: [
      tx({ id: "tx-1" }),
      tx({ id: "tx-2", amountCents: 2892, statementMonth: "2026-11", commissionType: "RENEWAL" }),
    ],
    agents: [CAREER_AGENT, INDEPENDENT_AGENT],
    rules: mapdRules(),
    locks: [],
    sources: [],
    earnings: [],
    ...overrides,
  };
}

function input(): EarningsInput {
  return {
    policies: [{ ...POLICY_INPUT, policyKey: "enrollment-20261008" }],
    payments: [
      {
        carrierTransactionId: "tx-1",
        policyKey: "enrollment-20261008",
        category: "T65",
        verified: true,
        evidenceReference: "Verified T65 carrier detail",
      },
      {
        carrierTransactionId: "tx-2",
        policyKey: "enrollment-20261008",
        category: "RENEWAL",
        renewalMonth: "2026-11",
        verified: true,
        evidenceReference: "November carrier renewal detail",
      },
    ],
  };
}

describe("buildEarningsPlan", () => {
  it("proposes pending sale and renewal earnings from locked rates", () => {
    const plan = buildEarningsPlan(input(), context());
    expect(plan.ready).toBe(true);
    expect(plan.summary.netNewCents).toBe(30700);
    expect(plan.newLocks).toHaveLength(1);
    expect(plan.rows.map((row) => row.amountCents)).toEqual([30000, 700]);
  });

  it("produces a stable signature and detects changed sources", () => {
    const a = buildEarningsPlan(input(), context());
    const b = buildEarningsPlan(input(), context());
    expect(a.signature).toBe(b.signature);

    const changed = buildEarningsPlan(
      input(),
      context({ transactions: [tx({ id: "tx-1", amountCents: 40000 }), context().transactions[1]] })
    );
    expect(changed.signature).not.toBe(a.signature);
    expect(() => assertReviewedPlanStillValid(a, changed)).toThrow(/changed/);
    expect(() => assertReviewedPlanStillValid(a, b)).not.toThrow();
  });

  it("treats a replay of an applied plan as existing, not new", () => {
    const first = buildEarningsPlan(input(), context());
    const lock = first.newLocks[0];
    const sources = first.rows.map((row, index) => ({
      carrierTransactionId: row.transactionId,
      earningId: `earning-${index}`,
      earningKey: row.earningKey!,
      sourceSignature: row.sourceSignature!,
    }));
    const earnings = first.rows.map((row, index) => ({
      id: `earning-${index}`,
      userId: CAREER_AGENT.id,
      carrierTransactionId: row.transactionId,
      earnedAmountCents: row.amountCents!,
    }));
    const replay = buildEarningsPlan(input(), context({ locks: [lock], sources, earnings }));
    expect(replay.rows.map((row) => row.status)).toEqual(["existing", "existing"]);
    expect(replay.summary.netNewCents).toBe(0);
    expect(replay.newLocks).toHaveLength(0);
    expect(replay.ready).toBe(true);
  });

  it("requires verified category evidence for every Career payment", () => {
    const missing = input();
    missing.payments[0].verified = false;
    const plan = buildEarningsPlan(missing, context());
    expect(plan.ready).toBe(false);
    expect(plan.rows[0].status).toBe("review");
  });

  it("flags both rows when two carrier lines claim one renewal month", () => {
    const base = context();
    const duplicate = tx({ id: "tx-3", amountCents: 2892, statementMonth: "2026-11", commissionType: "RENEWAL" });
    const data = input();
    data.payments.push({ ...data.payments[1], carrierTransactionId: "tx-3" });
    const plan = buildEarningsPlan(data, context({ transactions: [...base.transactions, duplicate] }));
    expect(plan.ready).toBe(false);
    expect(plan.summary.reviewRows).toBe(2);
  });

  it("blocks conflicting categories and negative payments", () => {
    const conflicting = input();
    conflicting.payments[1].category = "T65";
    expect(buildEarningsPlan(conflicting, context()).ready).toBe(false);

    const negative = context({
      transactions: [tx({ id: "tx-1" }), tx({ id: "tx-2", amountCents: -2892, statementMonth: "2026-11", commissionType: "RENEWAL" })],
    });
    expect(buildEarningsPlan(input(), negative).ready).toBe(false);
  });

  it("never pays from a generic COMMISSION row mapped as a renewal", () => {
    const data = input();
    data.payments[0] = { ...data.payments[0], category: "RENEWAL", renewalMonth: "2026-10" };
    expect(buildEarningsPlan(data, context()).ready).toBe(false);
  });

  it("excludes personal and independent production, and flags unassigned rows", () => {
    const excluded = context({
      transactions: [
        tx({ id: "tx-1", entityType: "personal" }),
        tx({ id: "tx-2", agentType: "independent", userId: INDEPENDENT_AGENT.id }),
      ],
    });
    const plan = buildEarningsPlan({ policies: [], payments: [] }, excluded);
    expect(plan.summary.excludedTransactions).toBe(2);
    expect(plan.summary.newEarnings).toBe(0);
    expect(plan.ready).toBe(true);

    const unassigned = context({ transactions: [tx({ id: "tx-9", userId: null, agentType: null })] });
    const flagged = buildEarningsPlan({ policies: [], payments: [] }, unassigned);
    expect(flagged.ready).toBe(false);
    expect(flagged.rows[0].reason).toMatch(/not verified as Career/);
  });

  it("rejects mappings that do not point at an eligible Career transaction", () => {
    const data = input();
    data.payments.push({ ...data.payments[0], carrierTransactionId: "tx-unknown" });
    const plan = buildEarningsPlan(data, context());
    expect(plan.ready).toBe(false);
    expect(plan.errors.join(" ")).toMatch(/eligible Career transaction/);
  });

  it("does not overwrite legacy earnings lacking policy provenance", () => {
    const legacy = context({
      earnings: [{ id: "legacy", userId: CAREER_AGENT.id, carrierTransactionId: "tx-1", earnedAmountCents: 123 }],
    });
    const plan = buildEarningsPlan(input(), legacy);
    expect(plan.ready).toBe(false);
    expect(plan.rows[0].reason).toMatch(/lacks matching policy provenance/);
  });

  it("surfaces policy-lock errors and blocks the batch", () => {
    const data = input();
    data.policies[0] = { ...data.policies[0], verified: false };
    const plan = buildEarningsPlan(data, context());
    expect(plan.ready).toBe(false);
    expect(plan.errors.join(" ")).toMatch(/evidence/);
  });
});
