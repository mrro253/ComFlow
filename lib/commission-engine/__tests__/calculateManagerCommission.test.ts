import { describe, expect, it } from "vitest";
import { calculateManagerCommission } from "@/lib/commission-engine/calculateManagerCommission";

describe("calculateManagerCommission", () => {
  it("calculates 2% of the sale amount per the MVP default plan", () => {
    expect(calculateManagerCommission(1000, 2)).toBe(20);
  });

  it("rounds to the nearest cent", () => {
    expect(calculateManagerCommission(2650, 2)).toBe(53);
  });

  it("returns 0 for a 0% plan", () => {
    expect(calculateManagerCommission(1000, 0)).toBe(0);
  });
});
