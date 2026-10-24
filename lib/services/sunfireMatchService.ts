import { listSunfireCollections, readSunfireCollection } from "@/lib/repositories/sunfireCollectionRepository";
import { loadSunfireMatchInventory } from "@/lib/repositories/sunfireMatchRepository";
import { loadPaymentDetails } from "@/lib/services/paymentDetailsService";
import { compareEnrollmentCommissions, type CommissionEvidence } from "@/lib/enrollments/commissionMatches";
import { digest } from "@/lib/carriers/digest";
import type { CurrentUser } from "@/types/domain";

export async function getSunfireMatches(user: CurrentUser, selected?: string) {
  if (!user.active || user.role !== "owner") throw new Error("Active owner required.");
  const collections = await listSunfireCollections(user);
  const current = selected ? collections.find(collection => collection.hash === selected) : collections[0];
  if (selected && !current) throw new Error("SunFire collection not found.");
  if (!current) return { current: null, range: null, matches: [], statementCount: 0, entryCount: 0, sourceNotes: {} as Record<string, string> };
  const collection = await readSunfireCollection(user, current.hash);
  const verified = await compareVerifiedEnrollments(user, collection.records);
  return { current, range: { start: collection.start, end: collection.end },
    matches: verified.matches,
    statementCount: verified.statementCount, entryCount: verified.entryCount,
    sourceNotes: verified.sourceNotes };
}

export async function compareVerifiedEnrollments(user: CurrentUser, records: import("@/lib/enrollments/sunfire").SunfireEnrollment[]) {
  if (!user.active || !["owner", "agent"].includes(user.role)) throw new Error("Active owner or agent required.");
  const inventory = await loadSunfireMatchInventory(user);
  const details = await loadPaymentDetails(inventory.entries.map(entry => entry.id), user.agencyId);
  if (details.size !== inventory.entries.length || inventory.entries.some(entry => !details.has(entry.id))) throw new Error("Some imported statement details could not be verified. Comparison stopped.");
  const evidence: CommissionEvidence[] = inventory.entries.map(entry => {
    const detail = details.get(entry.id)!;
    const field = (label: string) => detail.fields.find(field => field.label.toUpperCase().replace(/[^A-Z]/g, "") === label.toUpperCase().replace(/[^A-Z]/g, ""))?.value ?? "";
    const medicareId = detail.fields.find(field => /MBI|HICN|Medicare.*ID/i.test(field.label))?.value ?? "";
    return { entryId: entry.id, statementId: entry.statement_id, carrier: entry.carrier, clientName: detail.clientName,
      firstName: field(entry.carrier === "Devoted Health" ? "Member First" : "First Name"),
      lastName: field(entry.carrier === "Devoted Health" ? "Member Last" : "Last Name"), medicareId,
      plan: field("Plan") || (field("Contract") && field("PBP") ? `${field("Contract")}-${field("PBP").padStart(3, "0")}` : ""),
      effectiveDate: entry.effective_date, statementMonth: entry.statement_month, category: entry.commission_type,
      amountCents: entry.amount_cents, statementFilename: detail.statementFilename };
  });
  const after = await loadSunfireMatchInventory(user);
  if (digest(inventory) !== digest(after)) throw new Error("Commission records changed during the comparison. Reload to review current evidence.");
  return { matches: compareEnrollmentCommissions(records, evidence, inventory.statements.map(statement => statement.carrier)), statementCount: inventory.statements.length, entryCount: inventory.entries.length, sourceNotes: Object.fromEntries([...details].map(([id, detail]) => [id, detail.fields.find(field => field.label.toUpperCase() === "NOTES")?.value ?? ""])) };
}
