"use server";

import { loadClientCommissionHistory } from "@/lib/services/clientCommissionHistoryService";
import { revalidatePath } from "next/cache";
import { loadPaymentLedger } from "@/lib/services/paymentLedgerService";
import { PaymentFilterError } from "@/lib/reporting/paymentQuery";
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

    // A captive agent's production is credited to their principal.
    let credited = target;
    if (target.agentType === "captive") {
      const principal = context.users.find((u) => u.id === target.principalId && u.active);
      if (!principal || principal.agentType === "captive") {
        return { error: "This captive agent has no active principal to credit." };
      }
      credited = principal;
    }

    const rows = await assignTransaction({
      agencyId: owner.agencyId,
      actorId: owner.id,
      transactionId,
      user: credited,
      productionEntityId: productionEntityFor(credited, context.entities)?.id ?? null,
      writingUserId: credited.id === target.id ? null : target.id,
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

/** Search is a POST action so client names/member IDs never enter URLs or access logs. */
export async function queryPayments(input: unknown) {
  try {
    const user = await requireRole();
    return { data: await loadPaymentLedger(user, input) };
  } catch (error) {
    return { error: error instanceof PaymentFilterError ? error.message : "Could not load commission entries. Check your connection and sign-in, then try again." };
  }
}
/** POST only: carrier member identifiers and names never enter history URLs. */
export async function queryClientCommissionHistory(input: unknown) {
  try {
    const user = await requireRole();
    if (!input || typeof input !== "object") return { error: "Choose a commission entry to view its history." };
    const { transactionId, page } = input as { transactionId?: unknown; page?: unknown };
    if (typeof transactionId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(transactionId) ||
      (page !== undefined && (typeof page !== "number" || !Number.isSafeInteger(page) || page < 1))) return { error: "Choose a valid commission entry and page." };
    const data = await loadClientCommissionHistory(user, transactionId, page as number | undefined);
    return data ? { data } : { error: "This commission entry is unavailable or has no usable carrier member ID. Refresh the list and try again." };
  } catch { return { error: "Could not load client history. Check your sign-in and connection, then try again." }; }
}
