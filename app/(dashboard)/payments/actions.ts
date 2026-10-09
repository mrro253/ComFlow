"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/requireRole";
import { productionEntityFor } from "@/lib/carriers/writingAgentOwners";
import { getAgencyById } from "@/lib/repositories/agencyRepository";
import {
  AssignmentError,
  assignTransaction,
  loadWritingAgentContext,
} from "@/lib/repositories/statementRepository";
import type { ActionResult } from "@/app/(auth)/actions";

/** Owner assigns an unassigned carrier payment to a team member. */
export async function assignPayment(
  _prev: ActionResult | undefined,
  formData: FormData
): Promise<ActionResult> {
  try {
    const owner = await requireRole(["owner"]);
    const transactionId = String(formData.get("transactionId") ?? "");
    const userId = String(formData.get("userId") ?? "");
    const rememberAlias = formData.get("rememberAlias") === "on";
    if (!transactionId || !userId) return { error: "Choose who this payment belongs to." };

    const agency = await getAgencyById(owner.agencyId);
    const context = await loadWritingAgentContext(owner.agencyId, agency?.name ?? "Agency");
    const target = context.users.find((u) => u.id === userId && u.active);
    if (!target) return { error: "That teammate was not found." };

    const rows = await assignTransaction({
      agencyId: owner.agencyId,
      actorId: owner.id,
      transactionId,
      user: target,
      productionEntityId: productionEntityFor(target, context.entities)?.id ?? null,
      rememberAlias,
    });

    revalidatePath("/payments");
    revalidatePath("/dashboard");
    return { info: rows > 1 ? `Assigned ${rows} payments.` : "Assigned." };
  } catch (err) {
    if (err instanceof AssignmentError) return { error: err.message };
    return { error: err instanceof Error ? err.message : "Could not assign the payment." };
  }
}
