import type { Agency, Role } from "@/types/domain";

/**
 * A single nullable timestamp is the whole onboarding "state machine" for
 * MVP: null means the checklist hasn't been finished or dismissed yet.
 * Completion and dismissal are intentionally treated the same way (see
 * app/(dashboard)/onboarding/actions.ts).
 */
export function isOnboardingIncomplete(agency: Pick<Agency, "onboardingCompletedAt">): boolean {
  return agency.onboardingCompletedAt === null;
}

/** Onboarding is Owner-only - Managers and Agents never see or reach it. */
export function canAccessOnboarding(role: Role): boolean {
  return role === "owner";
}
