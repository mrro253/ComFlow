"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/requireRole";
import {
  completeAgencyOnboarding,
  updateAgencyName,
} from "@/lib/repositories/agencyRepository";
import type { ActionResult } from "@/app/(auth)/actions";

export async function updateOnboardingAgencyName(
  _prevState: ActionResult | undefined,
  formData: FormData
): Promise<ActionResult> {
  try {
    const user = await requireRole(["owner"]);
    const name = String(formData.get("name") ?? "").trim();
    if (!name) {
      return { error: "Agency name is required." };
    }
    await updateAgencyName(user.agencyId, name);
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Failed to update agency name.",
    };
  }

  revalidatePath("/onboarding");
  revalidatePath("/dashboard");
  return {};
}

/**
 * Marks onboarding complete and returns to the dashboard. Used by the
 * "Finish setup" button - "I'll finish later" calls this exact same action
 * (see components/onboarding/finish-onboarding-card.tsx): the app doesn't
 * distinguish completion from dismissal, both just clear the checklist.
 */
export async function finishOnboarding(): Promise<ActionResult> {
  try {
    const user = await requireRole(["owner"]);
    await completeAgencyOnboarding(user.agencyId);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to finish setup." };
  }

  revalidatePath("/dashboard");
  redirect("/dashboard");
}

/** Dismiss "x" on the dashboard checklist card - same effect as finishing, minus the redirect. */
export async function dismissOnboardingChecklist(): Promise<ActionResult> {
  try {
    const user = await requireRole(["owner"]);
    await completeAgencyOnboarding(user.agencyId);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to dismiss checklist." };
  }

  revalidatePath("/dashboard");
  return {};
}
