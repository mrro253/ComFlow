import type { CarrierConnectionRecord } from "@/lib/repositories/carrierConnectionRepository";
type State = Pick<CarrierConnectionRecord, "status" | "lastError" | "syncRequestedAt">;

/** A queued request never means the portal was checked or that no statements exist. */
export function connectionPresentation(connection: State) {
  if (connection.status === "disabled") return { label: "Disconnected", variant: "outline" as const, notice: null };
  if (connection.syncRequestedAt) return { label: "Update queued", variant: "secondary" as const, notice: "Waiting for the local worker to start this update. Results are not available yet." };
  if (connection.status === "needs_attention") {
    if (connection.lastError?.startsWith("Sync running.")) return { label: "Update in progress", variant: "secondary" as const, notice: connection.lastError };
    return { label: /verification|sign-in review/i.test(connection.lastError ?? "") ? "Sign-in needs attention" : "Needs attention", variant: "destructive" as const,
      notice: connection.lastError || "The last update did not complete. Statement availability has not been confirmed." };
  }
  return connection.status === "pending"
    ? { label: "Saved — not updated yet", variant: "secondary" as const, notice: null }
    : { label: "Connected", variant: "success" as const, notice: null };
}
