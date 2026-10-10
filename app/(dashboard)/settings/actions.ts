"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/requireRole";
import { createUserWithAuth, listUsersForAgency } from "@/lib/repositories/userRepository";
import { classifyForSave } from "@/lib/auth/agentClassification";
import { normalizePayeeId } from "@/lib/carriers/payeeId";
import type { ActionResult } from "@/app/(auth)/actions";

export interface AddUserResult extends ActionResult {
  temporaryPassword?: string;
}

export async function addUser(
  _prevState: AddUserResult | undefined,
  formData: FormData
): Promise<AddUserResult> {
  try {
    const currentUser = await requireRole(["owner"]);

    const firstName = String(formData.get("firstName") ?? "").trim();
    const lastName = String(formData.get("lastName") ?? "").trim();
    const email = String(formData.get("email") ?? "").trim();
    const role = String(formData.get("role") ?? "agent") as "manager" | "agent";
    const managerId = String(formData.get("managerId") ?? "") || null;

    if (!firstName || !lastName || !email) {
      return { error: "First name, last name, and email are required." };
    }

    const classification = classifyForSave({
      role,
      rawType: String(formData.get("agentType") ?? ""),
      rawLevel: String(formData.get("careerLevel") ?? ""),
      rawPrincipalId: String(formData.get("principalId") ?? ""),
      agentId: null,
      agencyId: currentUser.agencyId,
      team: await listUsersForAgency(currentUser.agencyId),
    });
    if (!classification.ok) return { error: classification.error };

    const { temporaryPassword } = await createUserWithAuth({
      agencyId: currentUser.agencyId,
      firstName,
      lastName,
      email,
      role,
      managerId,
      agentType: classification.agentType,
      careerLevel: classification.careerLevel,
      principalId: classification.principalId,
      payeeId: normalizePayeeId(String(formData.get("payeeId") ?? "")),
    });

    revalidatePath("/settings");
    return { temporaryPassword };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to add user." };
  }
}