import type { CurrentUser } from "@/types/domain";
import { listSunfireCollections, readSunfireCollection } from "@/lib/repositories/sunfireCollectionRepository";
import { readSaleEvents, readAuthorizedSaleSource, appendSaleEvent, validateSaleAgent } from "@/lib/repositories/saleDispositionRepository";
import { saleKey, saleAssignment, saleHistory, latestSaleDisposition, validateDisposition, type SaleEvent } from "@/lib/enrollments/saleDisposition";
import type { SunfireEnrollment } from "@/lib/enrollments/sunfire";

function allowed(user: CurrentUser) {
  if (!user.active || !["owner", "agent"].includes(user.role)) throw new Error("Active owner or assigned agent required.");
}
function saleView(row: SunfireEnrollment, ownerId: string, hash: string, events: SaleEvent[], includeSource = false) {
  return { source: includeSource ? row : undefined, ownerId, collectionHash: hash, code: row.code, clientName: `${row.firstName} ${row.lastName}`,
    carrier: row.carrier, plan: row.plan, proposedEffectiveDate: row.proposedEffectiveDate, submittedDate: row.submittedDate,
    assignedAgentId: saleAssignment(events, ownerId, hash, row.code),
    disposition: latestSaleDisposition(events, ownerId, hash, row.code), history: saleHistory(events, ownerId, hash, row.code) };
}
export async function listEditableSales(user: CurrentUser, selected?: string, includeSource = false) {
  allowed(user);
  const events = await readSaleEvents(user);
  if (user.role === "owner") {
    const collections = await listSunfireCollections(user);
    const current = selected ? collections.find(row => row.hash === selected) : collections[0];
    if (selected && !current) throw new Error("Collection not found.");
    if (!current) return [];
    const collection = await readSunfireCollection(user, current.hash);
    return collection.records.map(row => saleView(row, user.id, current.hash, events, includeSource));
  }
  const references = new Map<string, SaleEvent>();
  for (const event of events) references.set(saleKey(event.ownerId, event.collectionHash, event.enrollmentCode), event);
  const assigned = [...references.values()].filter(row => saleAssignment(events, row.ownerId, row.collectionHash, row.enrollmentCode) === user.id);
  if (assigned.length > 200) throw new Error("Assigned sales exceed the current review limit.");
  const sales = [];
  for (const ref of assigned) {
    const row = await readAuthorizedSaleSource(user, ref.ownerId, ref.collectionHash, ref.enrollmentCode);
    sales.push(saleView(row, ref.ownerId, ref.collectionHash, events, includeSource));
  }
  return sales;
}
export async function setSaleDisposition(user: CurrentUser, ownerId: string, hash: string, code: string, status: string, note: string) {
  allowed(user);
  const value = validateDisposition(status, note);
  await appendSaleEvent(user, ownerId, hash, code, { kind: "disposition", ...value });
}
export async function assignSale(user: CurrentUser, hash: string, code: string, agentId: string | null) {
  allowed(user);
  if (user.role !== "owner") throw new Error("Owner required to assign sales.");
  await validateSaleAgent(user, agentId);
  await appendSaleEvent(user, user.id, hash, code, { kind: "assignment", agentId });
}
