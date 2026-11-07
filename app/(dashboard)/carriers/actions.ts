"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/requireRole";
import { connectionCarriers } from "@/lib/carriers/connectionCarriers";
import {
  disconnectCarrier,
  listVisibleConnections,
  requestSync,
  saveCarrierLogin,
} from "@/lib/repositories/carrierConnectionRepository";
import { canManageCarrierLogin } from "@/lib/auth/carrierAccess";
import type { ActionResult } from "@/app/(auth)/actions";
import { localDate, sunfireDate, sunfirePortalUrl } from "@/lib/enrollments/sunfire";
import { connectionSyncBusy } from "@/lib/reporting/connectionStatus";

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
    if (!connectionCarriers(user.role === "owner").includes(carrier)) return { error: "Choose a supported carrier." };
    if (carrier === "Devoted Health" && process.env.DEVOTED_REVIEW_ENABLED !== "true") return { error: "Enable Devoted paired review before connecting this carrier." };
    if (!username || !password) return { error: "Enter both the username and password." };
    let sunfire: { portalUrl: string; enrollmentStart: string } | undefined;
    if (carrier === "SunFire") {
      if (!user.active) return { error: "An active owner account is required for SunFire." };
      try {
        const portalUrl = sunfirePortalUrl(String(formData.get("portalUrl") ?? ""));
        const enrollmentStart = sunfireDate(String(formData.get("enrollmentStart") ?? ""));
        if (enrollmentStart > localDate()) return { error: "Choose an enrollment start date that is today or earlier." };
        sunfire = { portalUrl, enrollmentStart };
      } catch { return { error: "Enter your agency's SunFire starting URL and a valid enrollment start date." }; }
    }

    await saveCarrierLogin({
      agencyId: user.agencyId,
      userId: user.id,
      carrier,
      login: { username, password, ...sunfire },
    });

    revalidatePath("/carriers");
    return { info: carrier === "SunFire" ? "Saved securely. Choose Sync enrollments to collect enrollment details for review. Commission records stay unchanged." : "Saved. Your login is encrypted and is only used to download your statements." };
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
    if (connection.carrier === "SunFire" && (user.role !== "owner" || !user.active || connection.userId !== user.id)) return { error: "SunFire sync is available for your own active owner connection." };

    if (connection.carrier === "Devoted Health" && (user.role !== "owner" || connection.userId !== user.id)) return { error: "Devoted sync is available for your own owner connection." };
    if (connectionSyncBusy(connection)) return { info: "This sync is already queued or running. Its progress will update here automatically." };
    await requestSync(user.agencyId, connection.id);
    revalidatePath("/carriers");
    return { info: connection.carrier === "SunFire" ? "Enrollment sync requested; no commissions are imported. Complete verification only if prompted; results will update here." : "Statement sync requested. Complete verification only if prompted. Downloads will be saved for review before import." };
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
