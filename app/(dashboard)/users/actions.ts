"use server";

import { activeLevelNames } from "@/lib/carriers/careerLevels";
import { listCareerLevels } from "@/lib/repositories/compensationSettingsRepository";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/requireRole";
import { getUserById, listUsersForAgency, updateUserProfile } from "@/lib/repositories/userRepository";
import { classifyForSave } from "@/lib/auth/agentClassification";
import { normalizePayeeId } from "@/lib/carriers/payeeId";
import type { ActionResult } from "@/app/(auth)/actions";

/**
 * Owner-only hierarchy edit: rename a teammate, promote/demote between
 * Agent and Manager, and reassign who they report to. This - not a CRM -
 * is the source of truth for org structure and roles.
 */
export async function editUser(
  _prevState: ActionResult | undefined,
  formData: FormData
): Promise<ActionResult> {
  try {
    const currentUser = await requireRole(["owner"]);

    const userId = String(formData.get("userId") ?? "");
    const firstName = String(formData.get("firstName") ?? "").trim();
    const lastName = String(formData.get("lastName") ?? "").trim();
    const role = String(formData.get("role") ?? "agent") as "manager" | "agent";
    const managerId =
      role === "manager" ? null : String(formData.get("managerId") ?? "") || null;
    // Empty selection means "use the agency's default plan" - see
    // `resolvePlanConfigForAgent` in commissionPlanRepository.ts.
    const commissionPlanId = String(formData.get("commissionPlanId") ?? "") || null;

    if (!userId || !firstName || !lastName) {
      return { error: "First name and last name are required." };
    }
    if (managerId === userId) {
      return { error: "A teammate can't report to themselves." };
    }

    const target = await getUserById(userId);
    if (!target || target.agencyId !== currentUser.agencyId) {
      return { error: "Teammate not found." };
    }
    if (target.role === "owner") {
      return { error: "The agency owner's role can't be changed here." };
    }

    const classification = classifyForSave({
      role,
      rawType: String(formData.get("agentType") ?? ""),
      rawLevel: String(formData.get("careerLevel") ?? ""),
      rawPrincipalId: String(formData.get("principalId") ?? ""),
      // A teammate keeps their current level even if it has since been turned off.
      validLevels: [
        ...activeLevelNames(await listCareerLevels(currentUser.agencyId)),
        ...(target.careerLevel ? [target.careerLevel] : []),
      ],
      agentId: userId,
      agencyId: currentUser.agencyId,
      team: await listUsersForAgency(currentUser.agencyId),
    });
    if (!classification.ok) return { error: classification.error };

    await updateUserProfile(userId, {
      firstName,
      lastName,
      role,
      managerId,
      commissionPlanId,
      agentType: classification.agentType,
      careerLevel: classification.careerLevel,
      principalId: classification.principalId,
      payeeId: normalizePayeeId(String(formData.get("payeeId") ?? "")),
      independentOwner:
        classification.agentType === "independent" && formData.get("independentOwner") === "true",
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to update teammate." };
  }

  revalidatePath("/users");
  revalidatePath("/settings");
  revalidatePath("/dashboard");
  return {};
}
