import { describe, expect, it } from "vitest";
import { evaluateBonusProgress } from "@/lib/commission-engine/evaluateBonusProgress";

describe("evaluateBonusProgress", () => {
  it("is not qualified and reports how many enrollments remain", () => {
    expect(evaluateBonusProgress(8, 10)).toEqual({ qualified: false, remaining: 2 });
  });

  it("qualifies exactly at the threshold", () => {
    expect(evaluateBonusProgress(10, 10)).toEqual({ qualified: true, remaining: 0 });
  });

  it("qualifies past the threshold", () => {
    expect(evaluateBonusProgress(15, 10)).toEqual({ qualified: true, remaining: 0 });
  });

  it("handles zero enrollments", () => {
    expect(evaluateBonusProgress(0, 10)).toEqual({ qualified: false, remaining: 10 });
  });
});
