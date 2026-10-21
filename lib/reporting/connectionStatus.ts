export function connectionStatus(status: "pending" | "active" | "needs_attention" | "disabled", message: string | null) {
  if (status === "needs_attention") {
    if (message?.startsWith("Sync running.")) return { label: "Sync in progress", variant: "secondary" } as const;
    if (message?.startsWith("Verification needed.")) return { label: "Needs verification", variant: "secondary" } as const;
    if (message?.startsWith("Sign-in review needed.")) return { label: "Review sign-in", variant: "secondary" } as const;
    return { label: "Needs attention", variant: "destructive" } as const;
  }
  return {
    pending: { label: "Saved - not synced yet", variant: "secondary" },
    active: { label: "Connected", variant: "success" },
    disabled: { label: "Disconnected", variant: "outline" },
  }[status] as { label: string; variant: "secondary" | "success" | "outline" };
}
