"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/requireRole";
import { createUserWithAuth } from "@/lib/repositories/userRepository";
import { parseAgentClassification } from "@/lib/auth/agentClassification";
import { upsertConnection } from "@/lib/repositories/crmConnectionRepository";
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

    const classification = parseAgentClassification(
      role,
      String(formData.get("agentType") ?? ""),
      String(formData.get("careerLevel") ?? "")
    );
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
    });

    revalidatePath("/settings");
    return { temporaryPassword };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to add user." };
  }
}

/**
 * TODO: This stands in for the real GoHighLevel OAuth flow. For now it
 * just marks the agency as "connected" so the rest of the UI/architecture
 * (webhook route, sync status) can be demoed end-to-end.
 */
export async function connectCRMStub(): Promise<ActionResult> {
  try {
    const user = await requireRole(["owner"]);
    await upsertConnection({ agencyId: user.agencyId, provider: "gohighlevel" });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to connect CRM." };
  }

  revalidatePath("/settings");
  return {};
}
