import type { CarrierConnectionRecord } from "@/lib/repositories/carrierConnectionRepository";
type State = Pick<CarrierConnectionRecord, "status" | "lastError" | "syncRequestedAt">;

export function connectionSyncBusy(connection: State): boolean {
  return connection.status !== "disabled" && (Boolean(connection.syncRequestedAt) ||
    connection.status === "needs_attention" && /^(Sync running\.|Verification needed\.|SunFire needs verification\.)/.test(connection.lastError ?? ""));
}

/** A queued request never means the portal was checked or that no statements exist. */
export function connectionPresentation(connection: State) {
  if (connection.status === "disabled") return { label: "Disconnected", variant: "outline" as const, notice: null };
  if (connection.syncRequestedAt) return { label: "Update queued", variant: "secondary" as const, notice: "Waiting for the local worker to start this update. Results are not available yet." };
  if (connection.status === "needs_attention") {
    if (connection.lastError?.startsWith("Sync running.")) return { label: "Update in progress", variant: "secondary" as const, notice: connection.lastError };
    if (/^(Verification needed\.|SunFire needs verification\.)/.test(connection.lastError ?? "")) return { label: "Enter security code", variant: "secondary" as const, notice: "Complete the security check in the verification window. This page updates automatically when collection resumes." };
    if (connection.lastError?.startsWith("Sign-in review needed.")) return { label: "Review sign-in", variant: "secondary" as const, notice: connection.lastError };
    return { label: /verification|sign-in review/i.test(connection.lastError ?? "") ? "Sign-in needs attention" : "Needs attention", variant: "destructive" as const,
      notice: connection.lastError || "The last update did not complete. Statement availability has not been confirmed." };
  }
  return connection.status === "pending"
    ? { label: "Saved — not updated yet", variant: "secondary" as const, notice: null }
    : { label: "Connected", variant: "success" as const, notice: null };
}
