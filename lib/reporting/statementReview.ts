export type ReviewLabel = "Already imported" | "New statement" | "Possible correction" | "Needs review";

export interface ReviewEvidence {
  carrier: string;
  userId: string | null;
  month: string | null;
  contentHash: string | null;
}

/** Presentation only: never authorizes importing, replacing, or deleting records. */
export function statementReviewLabel(incoming: ReviewEvidence, imported: readonly ReviewEvidence[]): ReviewLabel {
  if (!incoming.month || !incoming.contentHash) return "Needs review";
  const prior = imported.filter((s) => s.carrier === incoming.carrier && s.userId === incoming.userId && s.month === incoming.month);
  if (prior.some((s) => s.contentHash === incoming.contentHash)) return "Already imported";
  return prior.length ? "Possible correction" : "New statement";
}
