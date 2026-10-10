export const STATEMENT_STATUS_BADGE = {
  received: { label: "Needs review", variant: "secondary" },
  previewed: { label: "Needs review", variant: "secondary" },
  imported: { label: "Imported", variant: "success" },
  superseded: { label: "Superseded", variant: "outline" },
  failed: { label: "Failed", variant: "destructive" },
} as const;
