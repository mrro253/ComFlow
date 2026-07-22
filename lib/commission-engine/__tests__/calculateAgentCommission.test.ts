import { describe, expect, it } from "vitest";
import { calculateAgentCommission } from "@/lib/commission-engine/calculateAgentCommission";

describe("calculateAgentCommission", () => {
  it("calculates 10% of the sale amount per the MVP default plan", () => {
    expect(calculateAgentCommission(1000, 10)).toBe(100);
  });

  it("rounds to the nearest cent", () => {
    expect(calculateAgentCommission(2650, 10)).toBe(265);
    expect(calculateAgentCommission(33.33, 10)).toBe(3.33);
  });

  it("returns 0 for a 0% plan", () => {
    expect(calculateAgentCommission(1000, 0)).toBe(0);
  });

  it("supports a future higher/lower configured percentage", () => {
    expect(calculateAgentCommission(1000, 15)).toBe(150);
  });
});
