export const policyStatuses = ["Active", "Inactive", "Future Active", "Unknown"] as const;
export type PolicyStatus = typeof policyStatuses[number];
export type SaleEvent = {
  id: string; recordedAt: string; actorId: string; actorName: string;
  ownerId: string; collectionHash: string; enrollmentCode: string;
} & ({ kind: "assignment"; agentId: string | null } | { kind: "disposition"; status: PolicyStatus; note: string });
export function saleKey(ownerId: string, hash: string, code: string) { return `${ownerId}/${hash}/${code}`; }
export function saleHistory(events: SaleEvent[], ownerId: string, hash: string, code: string) {
  return events.filter(row => saleKey(row.ownerId, row.collectionHash, row.enrollmentCode) === saleKey(ownerId, hash, code))
    .sort((a, b) => b.recordedAt.localeCompare(a.recordedAt) || b.id.localeCompare(a.id));
}
export function saleAssignment(events: SaleEvent[], ownerId: string, hash: string, code: string) {
  const latest = saleHistory(events, ownerId, hash, code).find(row => row.kind === "assignment");
  return latest?.kind === "assignment" ? latest.agentId : null;
}
export function latestSaleDisposition(events: SaleEvent[], ownerId: string, hash: string, code: string) {
  const latest = saleHistory(events, ownerId, hash, code).find(row => row.kind === "disposition");
  return latest?.kind === "disposition" ? latest : null;
}
export function validateDisposition(status: string, note: string): { status: PolicyStatus; note: string } {
  if (!(policyStatuses as readonly string[]).includes(status) || !note.trim() || note.trim().length > 2000) throw new Error("Choose a policy status and enter an explanation of up to 2,000 characters.");
  return { status: status as PolicyStatus, note: note.trim() };
}
