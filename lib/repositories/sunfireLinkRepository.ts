import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { digest } from "@/lib/carriers/digest";
import type { ConfirmedEnrollmentLink } from "@/lib/enrollments/confirmedLinks";
import type { CurrentUser } from "@/types/domain";

const action = "sunfire.commission_links_confirmed";
async function authorize(user: CurrentUser, hash: string) {
  if (!user.active || user.role !== "owner" || !/^[a-f0-9]{64}$/.test(hash)) throw new Error("Active owner and valid collection required.");
  const session = await createClient();
  const owner = await session.from("users").select("id").eq("id", user.id).eq("agency_id", user.agencyId).eq("active", true).eq("role", "owner").single();
  if (owner.error || !owner.data) throw new Error("Owner access unavailable.");
}
/** Immutable audit events hold explicit owner confirmations; financial rows are never updated. */
export async function readConfirmedSunfireLinks(user: CurrentUser, hash: string): Promise<ConfirmedEnrollmentLink[]> {
  await authorize(user, hash);
  const links: ConfirmedEnrollmentLink[] = [];
  for (let offset = 0; offset < 10000; offset += 500) {
    const result = await createAdminClient().from("audit_events").select("details").eq("agency_id", user.agencyId).eq("actor_user_id", user.id)
      .eq("action", action).eq("entity_type", "sunfire_collection").eq("entity_id", hash).order("id").range(offset, offset + 499);
    if (result.error) throw new Error("Could not read enrollment link confirmations.");
    for (const event of result.data ?? []) {
      const value = event.details as { version?: unknown; links?: ConfirmedEnrollmentLink[] };
      if (value?.version !== 1 || !Array.isArray(value.links) || value.links.some(link => typeof link.enrollmentCode !== "string" ||
        !/^[a-f0-9]{64}$/.test(link.evidenceHash) || !Array.isArray(link.entryIds) || link.entryIds.some(id => typeof id !== "string"))) throw new Error("Invalid link confirmation.");
      links.push(...value.links);
    }
    if ((result.data?.length ?? 0) < 500) return links;
  }
  throw new Error("Too many link confirmations.");
}
export async function appendSunfireLinkConfirmation(user: CurrentUser, hash: string, links: ConfirmedEnrollmentLink[]) {
  await authorize(user, hash);
  if (!links.length) return;
  // A deterministic event UUID makes retries idempotent without mutating the append-only audit trail.
  const key = digest({ agency: user.agencyId, owner: user.id, hash, links });
  const id = `${key.slice(0, 8)}-${key.slice(8, 12)}-5${key.slice(13, 16)}-a${key.slice(17, 20)}-${key.slice(20, 32)}`;
  const result = await createAdminClient().from("audit_events").insert({ id, agency_id: user.agencyId, actor_user_id: user.id,
    action, entity_type: "sunfire_collection", entity_id: hash,
    details: { version: 1, basis: "owner_confirmed_name_identifier_carrier_effective_date", links: links.map(link => ({ ...link })) } });
  if (result.error && result.error.code !== "23505") throw new Error("Could not save enrollment link confirmations.");
}
