"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/requireRole";
import { getStatementParser } from "@/lib/carriers";
import {
  disconnectCarrier,
  listVisibleConnections,
  requestSync,
  saveCarrierLogin,
} from "@/lib/repositories/carrierConnectionRepository";
import { canManageCarrierLogin } from "@/lib/auth/carrierAccess";
import type { ActionResult } from "@/app/(auth)/actions";

export async function saveCarrierCredentials(
  _prev: ActionResult | undefined,
  formData: FormData
): Promise<ActionResult> {
  try {
    const user = await requireRole();
    if (!canManageCarrierLogin(user)) {
      return { error: "Your agency handles carrier statements for you." };
    }

    const carrier = String(formData.get("carrier") ?? "");
    const username = String(formData.get("username") ?? "").trim();
    const password = String(formData.get("password") ?? "");
    if (!getStatementParser(carrier)) return { error: "Choose a supported carrier." };
    if (!username || !password) return { error: "Enter both the username and password." };

    await saveCarrierLogin({
      agencyId: user.agencyId,
      userId: user.id,
      carrier,
      login: { username, password },
    });

    revalidatePath("/carriers");
    return { info: "Saved. Your login is encrypted and is only used to download your statements." };
  } catch (err) {
    // Deliberately generic: never echo anything from the form back in an error.
    return { error: err instanceof Error && err.name === "UnauthorizedError" ? err.message : "Could not save your login." };
  }
}

/** RLS-scoped lookup: the Owner sees the agency's connections, everyone else only their own. */
async function findVisibleConnection(connectionId: string) {
  const visible = await listVisibleConnections();
  return visible.find((c) => c.id === connectionId) ?? null;
}

export async function syncCarrierNow(
  _prev: ActionResult | undefined,
  formData: FormData
): Promise<ActionResult> {
  try {
    const user = await requireRole();
    const connection = await findVisibleConnection(String(formData.get("connectionId") ?? ""));
    if (!connection) return { error: "Connection not found." };
    if (connection.status === "disabled") return { error: "Reconnect your login first." };

    await requestSync(user.agencyId, connection.id);
    revalidatePath("/carriers");
    return { info: "Sync requested. New statements will appear under Statements shortly." };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not request a sync." };
  }
}

export async function disconnectCarrierLogin(
  _prev: ActionResult | undefined,
  formData: FormData
): Promise<ActionResult> {
  try {
    const user = await requireRole();
    const connection = await findVisibleConnection(String(formData.get("connectionId") ?? ""));
    if (!connection) return { error: "Connection not found." };

    await disconnectCarrier(user.agencyId, connection.id);
    revalidatePath("/carriers");
    return { info: "Login removed. Your imported data is untouched." };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not disconnect." };
  }
}
