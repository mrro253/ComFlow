import { describe, expect, it } from "vitest";
import { canAccessOnboarding, isOnboardingIncomplete } from "@/lib/onboarding";

describe("isOnboardingIncomplete", () => {
  it("is incomplete when onboardingCompletedAt is null", () => {
    expect(isOnboardingIncomplete({ onboardingCompletedAt: null })).toBe(true);
  });

  it("is complete once onboardingCompletedAt is set (finish and dismiss are treated the same)", () => {
    expect(
      isOnboardingIncomplete({ onboardingCompletedAt: "2026-07-29T00:00:00.000Z" })
    ).toBe(false);
  });
});

describe("canAccessOnboarding", () => {
  it("allows only the owner role", () => {
    expect(canAccessOnboarding("owner")).toBe(true);
    expect(canAccessOnboarding("manager")).toBe(false);
    expect(canAccessOnboarding("agent")).toBe(false);
  });
});
