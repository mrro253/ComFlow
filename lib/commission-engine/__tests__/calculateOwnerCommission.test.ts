import { describe, expect, it } from "vitest";
import { calculateOwnerCommission } from "@/lib/commission-engine/calculateOwnerCommission";

describe("calculateOwnerCommission", () => {
  it("calculates 1% of the sale amount per the MVP default plan", () => {
    expect(calculateOwnerCommission(1000, 1)).toBe(10);
  });

  it("rounds to the nearest cent", () => {
    expect(calculateOwnerCommission(2650, 1)).toBe(26.5);
  });

  it("returns 0 for a 0% plan", () => {
    expect(calculateOwnerCommission(1000, 0)).toBe(0);
  });
});
