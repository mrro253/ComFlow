import type { CompensationRule, PolicyLockInput } from "@/lib/carriers/compensation/policyLock";
import type { LockAgent } from "@/lib/carriers/compensation/policyLock";
import type { CareerLevel } from "@/types/domain";

/** Synthetic Career/Independent agents. */
export const CAREER_AGENT: LockAgent = { id: "agent-career", agentType: "career" };
export const INDEPENDENT_AGENT: LockAgent = { id: "agent-independent", agentType: "independent" };

type Schedule = [CareerLevel, number, number, number];

/** Confirmed MAPD schedule (cents): T65, plan change, monthly renewal, effective 2026-10-08. */
const MAPD_SCHEDULE: Schedule[] = [
  ["Benefit Consultant", 30000, 10000, 700],
  ["Senior Benefit Consultant", 35000, 12500, 1000],
  ["Client Advisor", 40000, 15000, 1250],
  ["Private Client Advisor", 45000, 15000, 1500],
];

export function mapdRules(effectiveFrom = "2026-10-08"): CompensationRule[] {
  const rules: CompensationRule[] = [];
  for (const [level, t65, planChange, renewal] of MAPD_SCHEDULE) {
    const rates: [string, number][] = [
      ["T65", t65],
      ["PLAN_CHANGE", planChange],
      ["RENEWAL", renewal],
    ];
    for (const [commissionType, rateCents] of rates) {
      rules.push({
        id: `rule-${level}-${commissionType}`,
        agentType: "career",
        careerLevel: level,
        product: "MAPD",
        commissionType,
        calculationMethod: "FIXED",
        rateCents,
        ratePercent: null,
        status: "ACTIVE",
        effectiveFrom,
        effectiveTo: null,
      });
    }
  }
  return rules;
}

export const POLICY_INPUT: PolicyLockInput = {
  carrier: "Test Carrier",
  policyKey: "policy-A",
  memberId: "member-1",
  agentId: CAREER_AGENT.id,
  writtenDate: "2026-10-08",
  careerLevelAtWrite: "Benefit Consultant",
  saleCategory: "T65",
  verified: true,
  evidenceReference: "verified enrollment + historical tier",
};
