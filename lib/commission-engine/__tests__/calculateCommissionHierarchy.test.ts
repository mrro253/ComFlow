import { describe, expect, it } from "vitest";
import { calculateCommissionHierarchy } from "@/lib/commission-engine/calculateCommissionHierarchy";
import {
  sampleCalculationInput,
  sampleOwnerAsAgentCalculationInput,
  sampleUnmanagedCalculationInput,
} from "@/lib/commission-engine/__fixtures__/sampleTransactions";

describe("calculateCommissionHierarchy", () => {
  it("matches the MVP spec example: $1000 sale -> agent $100, manager $20, owner $10", () => {
    const lines = calculateCommissionHierarchy({
      ...sampleCalculationInput,
      opportunity: { ...sampleCalculationInput.opportunity, saleAmount: 1000 },
    });

    expect(lines).toEqual([
      expect.objectContaining({
        role: "agent",
        commissionAmount: 100,
        userId: sampleCalculationInput.agent.id,
      }),
      expect.objectContaining({
        role: "manager",
        commissionAmount: 20,
        userId: sampleCalculationInput.manager?.id,
      }),
      expect.objectContaining({
        role: "owner",
        commissionAmount: 10,
        userId: sampleCalculationInput.owner.id,
      }),
    ]);
  });

  it("produces exactly 3 lines when the agent has a manager", () => {
    const lines = calculateCommissionHierarchy(sampleCalculationInput);
    expect(lines).toHaveLength(3);
    expect(lines.map((l) => l.role)).toEqual(["agent", "manager", "owner"]);
  });

  it("skips the manager line when the agent has no manager", () => {
    const lines = calculateCommissionHierarchy(sampleUnmanagedCalculationInput);
    expect(lines).toHaveLength(2);
    expect(lines.map((l) => l.role)).toEqual(["agent", "owner"]);
  });

  it("does not double-pay the owner when the owner is also the selling agent", () => {
    const lines = calculateCommissionHierarchy(sampleOwnerAsAgentCalculationInput);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ role: "agent" });
  });

  it("every line carries the original sale amount for auditability", () => {
    const lines = calculateCommissionHierarchy(sampleCalculationInput);
    for (const line of lines) {
      expect(line.saleAmount).toBe(sampleCalculationInput.opportunity.saleAmount);
    }
  });

  it("respects a custom (non-default) plan configuration", () => {
    const lines = calculateCommissionHierarchy({
      ...sampleCalculationInput,
      opportunity: { ...sampleCalculationInput.opportunity, saleAmount: 2000 },
      plan: {
        id: "custom-plan",
        name: "Custom Plan",
        rates: {
          agent: { new: 12, renewal: 12 },
          manager: { new: 3, renewal: 3 },
          owner: { new: 1.5, renewal: 1.5 },
        },
      },
    });

    expect(lines.find((l) => l.role === "agent")?.commissionAmount).toBe(240);
    expect(lines.find((l) => l.role === "manager")?.commissionAmount).toBe(60);
    expect(lines.find((l) => l.role === "owner")?.commissionAmount).toBe(30);
  });

  it("uses the renewal rate (not the new-business rate) for a renewal opportunity", () => {
    // samplePlan: agent new=10/renewal=5, manager new=2/renewal=1, owner new=1/renewal=1.
    const lines = calculateCommissionHierarchy({
      ...sampleCalculationInput,
      opportunity: {
        ...sampleCalculationInput.opportunity,
        saleAmount: 1000,
        businessType: "renewal",
      },
    });

    expect(lines.find((l) => l.role === "agent")?.commissionAmount).toBe(50);
    expect(lines.find((l) => l.role === "manager")?.commissionAmount).toBe(10);
    expect(lines.find((l) => l.role === "owner")?.commissionAmount).toBe(10);
    for (const line of lines) {
      expect(line.businessType).toBe("renewal");
    }
  });
});
