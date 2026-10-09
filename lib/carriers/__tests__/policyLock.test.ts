import { describe, expect, it } from "vitest";
import {
  buildPolicyLock,
  quoteCareerPayment,
  type PaymentForQuote,
} from "@/lib/carriers/compensation/policyLock";
import {
  CAREER_AGENT,
  INDEPENDENT_AGENT,
  POLICY_INPUT,
  mapdRules,
} from "@/lib/carriers/__fixtures__/compensation";

const rules = mapdRules();
const context = { agent: CAREER_AGENT, rules };

function payment(overrides: Partial<PaymentForQuote> = {}): PaymentForQuote {
  return {
    id: "tx-1",
    userId: CAREER_AGENT.id,
    carrier: "Test Carrier",
    memberId: "member-1",
    amountCents: 2892,
    statementMonth: "2026-11",
    commissionType: "RENEWAL",
    entityType: "agency",
    ...overrides,
  };
}

describe("buildPolicyLock", () => {
  it("snapshots the rates for the level the policy was written at", () => {
    const lock = buildPolicyLock(POLICY_INPUT, context);
    expect(lock.saleRateCents).toBe(30000);
    expect(lock.renewalRateCents).toBe(700);
    expect(lock.product).toBe("MAPD");
  });

  it("keeps old rates after a promotion while new policies use promoted rates", () => {
    const old = buildPolicyLock(POLICY_INPUT, context);
    const fresh = buildPolicyLock(
      {
        ...POLICY_INPUT,
        policyKey: "policy-B",
        careerLevelAtWrite: "Senior Benefit Consultant",
        writtenDate: "2026-10-09",
      },
      context
    );
    expect(quoteCareerPayment(old, payment()).status).toBe("quoted");
    expect(old.renewalRateCents).toBe(700);
    expect(fresh.renewalRateCents).toBe(1000);
    expect(fresh.saleRateCents).toBe(35000);
  });

  it("ignores later rule edits when replaying an existing lock", () => {
    const existing = buildPolicyLock(POLICY_INPUT, context);
    const edited = rules.map((rule) => ({ ...rule, rateCents: 99900 }));
    const replay = buildPolicyLock(POLICY_INPUT, { agent: CAREER_AGENT, rules: edited, existing });
    expect(replay).toBe(existing);
    expect(replay.renewalRateCents).toBe(700);
  });

  it("rejects a conflicting replay of an existing lock", () => {
    const existing = buildPolicyLock(POLICY_INPUT, context);
    expect(() =>
      buildPolicyLock(
        { ...POLICY_INPUT, careerLevelAtWrite: "Senior Benefit Consultant" },
        { ...context, existing }
      )
    ).toThrow(/conflicts/);
  });

  it("blocks unverified history and non-Career agents", () => {
    expect(() => buildPolicyLock({ ...POLICY_INPUT, verified: false }, context)).toThrow(/evidence/);
    expect(() =>
      buildPolicyLock({ ...POLICY_INPUT, agentId: INDEPENDENT_AGENT.id }, { ...context, agent: INDEPENDENT_AGENT })
    ).toThrow(/Career/);
    expect(() => buildPolicyLock(POLICY_INPUT, { ...context, agent: undefined })).toThrow(/Career/);
  });

  it("rejects invalid dates and dates before any rule is effective", () => {
    expect(() => buildPolicyLock({ ...POLICY_INPUT, writtenDate: "2026-02-30" }, context)).toThrow();
    expect(() => buildPolicyLock({ ...POLICY_INPUT, writtenDate: "2026-10-07" }, context)).toThrow(/Missing/);
  });

  it("refuses overlapping or unconfigured schedules instead of guessing", () => {
    const duplicate = [...rules, { ...rules[0], id: "rule-dup" }];
    expect(() => buildPolicyLock(POLICY_INPUT, { agent: CAREER_AGENT, rules: duplicate })).toThrow(/overlapping/);

    const unconfigured = rules.map((rule) => ({ ...rule, status: "NOT_CONFIGURED" as const }));
    expect(() => buildPolicyLock(POLICY_INPUT, { agent: CAREER_AGENT, rules: unconfigured })).toThrow(/Missing/);
  });
});

describe("quoteCareerPayment", () => {
  const lock = buildPolicyLock(POLICY_INPUT, context);

  it("uses the carrier category to decide the quote", () => {
    expect(quoteCareerPayment(lock, payment({ commissionType: "T65", statementMonth: "2026-10" }))).toMatchObject({
      status: "quoted",
      category: "T65",
      earnedAmountCents: 30000,
    });
    expect(quoteCareerPayment(lock, payment())).toMatchObject({
      status: "quoted",
      category: "RENEWAL",
      earnedAmountCents: 700,
    });
  });

  it("sends generic, mismatched, and negative payments to review", () => {
    for (const overrides of [
      { commissionType: "COMMISSION" },
      { commissionType: "PLAN_CHANGE" },
      { amountCents: -100 },
      { amountCents: 0 },
      { statementMonth: "2026-09" },
    ]) {
      expect(quoteCareerPayment(lock, payment(overrides)).status).toBe("review");
    }
  });

  it("never quotes personal production or another agent's payment", () => {
    expect(quoteCareerPayment(lock, payment({ entityType: "personal" })).status).toBe("review");
    expect(quoteCareerPayment(lock, payment({ userId: "someone-else" })).status).toBe("review");
    expect(quoteCareerPayment(lock, payment({ memberId: "member-2" })).status).toBe("review");
  });
});
