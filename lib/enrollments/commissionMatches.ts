import type { SunfireEnrollment } from "./sunfire";

export interface CommissionEvidence {
  entryId: string; statementId: string; carrier: string; clientName: string;
  firstName: string; lastName: string; medicareId: string; effectiveDate: string;
  plan?: string; statementMonth: string; category: string; amountCents: number; statementFilename: string;
}
export type MatchStatus = "full" | "strong" | "date" | "identity" | "unmatched" | "no_statements";
export const matchLabels: Record<MatchStatus, string> = {
  full: "Full Medicare ID, name, carrier and date agree",
  strong: "Strong candidate — shortened Medicare ID",
  date: "Client candidate — effective date differs",
  identity: "Identity or enrollment details need review",
  unmatched: "No supported match in imported statements",
  no_statements: "No imported statements for this carrier",
};
const norm = (value: string) => value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]/g, "");
/** Public source-carrier aliases, never customer-specific routing or assignment. */
export function canonicalEnrollmentCarrier(value: string) {
  const key = norm(value);
  if (["ULTIMATEHEALTHPLANINC", "ULTIMATEHEALTHPLANS", "ULTIMATEHEALTHPLAN"].includes(key)) return "Ultimate Health Plans";
  if (["UNITEDHEALTHCARE", "UHC"].includes(key)) return "UnitedHealthcare";
  if (["DEVOTED", "DEVOTEDHEALTH", "DEVOTEDHEALTHINC"].includes(key)) return "Devoted Health";
  return value.trim();
}
function sameName(enrollment: SunfireEnrollment, row: CommissionEvidence) {
  if (row.firstName && row.lastName) return norm(row.firstName) === norm(enrollment.firstName) && norm(row.lastName) === norm(enrollment.lastName);
  return [norm(`${enrollment.firstName} ${enrollment.lastName}`), norm(`${enrollment.lastName} ${enrollment.firstName}`)].includes(norm(row.clientName));
}
export function compareEnrollmentCommissions(enrollments: SunfireEnrollment[], entries: CommissionEvidence[], importedCarriers: string[]) {
  const available = new Set(importedCarriers.map(canonicalEnrollmentCarrier));
  const seen = new Set<string>();
  for (const row of entries) {
    if (seen.has(row.entryId) || !Number.isSafeInteger(row.amountCents)) throw new Error("Ambiguous commission evidence.");
    seen.add(row.entryId);
  }
  const matches = enrollments.map((enrollment) => {
    const carrier = canonicalEnrollmentCarrier(enrollment.carrier);
    const candidates = entries.filter(row => canonicalEnrollmentCarrier(row.carrier) === carrier).map(row => {
      const id = norm(row.medicareId), mbi = norm(enrollment.mbi);
      const fullId = id.length === 11 && id === mbi;
      const partialId = id.length === 5 && mbi.endsWith(id);
      const name = sameName(enrollment, row), date = row.effectiveDate === enrollment.proposedEffectiveDate;
      const planCode = (value: string) => norm(value.match(/[A-Z]\d{4}[- ]\d{3}/i)?.[0] ?? "");
      const sourcePlan = planCode(row.plan ?? ""), enrollmentPlan = planCode(enrollment.plan);
      const planConflict = Boolean(sourcePlan && enrollmentPlan && sourcePlan !== enrollmentPlan);
      const conflict = name && !fullId && !partialId || planConflict;
      if (!fullId && !(partialId && name) && !(name && date)) return null;
      const display = { entryId: row.entryId, statementId: row.statementId, carrier: row.carrier,
        clientName: row.clientName, effectiveDate: row.effectiveDate, statementMonth: row.statementMonth,
        category: row.category, amountCents: row.amountCents, statementFilename: row.statementFilename };
      // Only a masked identifier and explicit evidence flags reach the view model.
      return { ...display, identifierDisplay: id ? `•••${id.slice(-4)}` : "Not provided", fullId, partialId, name, date, conflict,
        chargeback: row.category === "CHARGEBACK" };
    }).filter((row): row is NonNullable<typeof row> => row !== null);
    const full = candidates.filter(row => row.fullId && row.name && row.date && !row.conflict);
    const strong = candidates.filter(row => row.partialId && row.name && row.date && !row.conflict);
    const date = candidates.filter(row => row.partialId && row.name && !row.date);
    const status: MatchStatus = full.length ? "full" : strong.length ? "strong" : candidates.some(row => row.fullId || row.conflict) ? "identity" : date.length ? "date" : available.has(carrier) ? "unmatched" : "no_statements";
    return { enrollmentCode: enrollment.code, clientName: `${enrollment.firstName} ${enrollment.lastName}`, carrier,
      plan: enrollment.plan, proposedEffectiveDate: enrollment.proposedEffectiveDate, mbiDisplay: `•••••••${enrollment.mbi.slice(-4)}`,
      status, label: matchLabels[status], evidence: candidates,
      chargebackEntries: candidates.filter(row => row.chargeback).length,
      sharedEvidence: false };
  });
  const uses = new Map<string, number>();
  for (const match of matches) for (const row of match.evidence.filter(row => (row.fullId || row.partialId) && row.name && row.date && !row.conflict)) uses.set(row.entryId, (uses.get(row.entryId) ?? 0) + 1);
  for (const match of matches) match.sharedEvidence = match.evidence.some(row => (uses.get(row.entryId) ?? 0) > 1);
  return matches;
}
export type EnrollmentCommissionMatch = ReturnType<typeof compareEnrollmentCommissions>[number];
export function filterEnrollmentMatches(rows: EnrollmentCommissionMatch[], filter: string, query: string) {
  const search = norm(query.slice(0, 200));
  return rows.filter(row => (!search || norm(`${row.clientName} ${row.carrier} ${row.plan}`).includes(search)) &&
    (filter === "chargebacks" ? row.chargebackEntries > 0 : ["full", "strong", "date", "identity", "unmatched", "no_statements"].includes(filter) ? row.status === filter : true));
}
