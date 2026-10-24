import { createAdminClient } from "@/lib/supabase/admin";
import { readAuthorizedSaleSource } from "./saleDispositionRepository";
import { applicationKey, applicationFingerprint, validateApplicationOutcome, type ApplicationOutcome } from "@/lib/enrollments/applicationOutcome";
import { digest } from "@/lib/carriers/digest";
import type { CurrentUser } from "@/types/domain";

/** Recheck assignment before reading another actor's application-specific audit history. */
export async function readApplicationOutcomes(user: CurrentUser, ownerId: string, hash: string, code: string) {
  const source = await readAuthorizedSaleSource(user, ownerId, hash, code);
  const key = applicationKey(user.agencyId, ownerId, code);
  const history: ApplicationOutcome[] = [];
  for (let offset = 0; offset < 10000; offset += 500) {
    const result = await createAdminClient().from("audit_events").select("id,details,created_at")
      .eq("agency_id", user.agencyId).eq("action", "sunfire.application_outcome_updated").eq("entity_type", "sunfire_application").eq("entity_id", key)
      .order("created_at", { ascending: false }).order("id", { ascending: false }).range(offset, offset + 499);
    if (result.error) throw new Error("Could not read this enrollment's history.");
    for (const event of result.data ?? []) {
      const value = event.details as Record<string, unknown>;
      if (value?.version !== 1 || value.ownerId !== ownerId || value.enrollmentCode !== code || typeof value.fingerprint !== "string" || !/^[a-f0-9]{64}$/.test(value.fingerprint) || typeof value.actorName !== "string" || typeof value.status !== "string" || typeof value.note !== "string") throw new Error("Invalid enrollment outcome history.");
      const outcome = validateApplicationOutcome(value.status, value.note);
      history.push({ id: event.id, ...outcome, fingerprint: value.fingerprint, actorName: value.actorName, recordedAt: event.created_at });
    }
    if ((result.data?.length ?? 0) < 500) return { history, latest: history.find(row => row.fingerprint === applicationFingerprint(source)), key, fingerprint: applicationFingerprint(source) };
  }
  throw new Error("Enrollment history exceeds the current limit.");
}

export async function appendApplicationOutcome(user: CurrentUser, ownerId: string, hash: string, code: string, status: string, note: string) {
  const value = validateApplicationOutcome(status, note);
  const previous = await readApplicationOutcomes(user, ownerId, hash, code);
  if (previous.latest?.status === value.status && previous.latest.note === value.note) return;
  // Recheck at mutation time; a revoked assignment must not retain write access.
  const source = await readAuthorizedSaleSource(user, ownerId, hash, code);
  if (applicationFingerprint(source) !== previous.fingerprint) throw new Error("Enrollment changed. Reload before saving.");
  const digestId = digest({ agency: user.agencyId, actor: user.id, application: previous.key, fingerprint: previous.fingerprint, ...value, previous: previous.latest?.id ?? null });
  const id = `${digestId.slice(0, 8)}-${digestId.slice(8, 12)}-5${digestId.slice(13, 16)}-a${digestId.slice(17, 20)}-${digestId.slice(20, 32)}`;
  const result = await createAdminClient().from("audit_events").insert({ id, agency_id: user.agencyId, actor_user_id: user.id,
    action: "sunfire.application_outcome_updated", entity_type: "sunfire_application", entity_id: previous.key,
    details: { version: 1, ownerId, enrollmentCode: code, collectionHash: hash, fingerprint: previous.fingerprint,
      actorName: `${user.firstName} ${user.lastName}`, ...value } });
  if (result.error && result.error.code !== "23505") throw new Error("Could not save this enrollment's outcome.");
}
