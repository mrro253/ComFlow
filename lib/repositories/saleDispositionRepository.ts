import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { randomUUID } from "node:crypto";
import { policyStatuses, saleAssignment, validateDisposition, type SaleEvent, type PolicyStatus } from "@/lib/enrollments/saleDisposition";
import { SUNFIRE_MAX_BYTES, sunfireCollectionBytes, sunfireCollectionHash, sunfireStoragePath, validateSunfireCollection } from "@/lib/enrollments/sunfire";
import type { CurrentUser } from "@/types/domain";

const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
async function authorize(user: CurrentUser) {
  if (!user.active || !["owner", "agent"].includes(user.role)) throw new Error("Active owner or assigned agent required.");
  const client = await createClient();
  const result = await client.from("users").select("id").eq("agency_id", user.agencyId).eq("id", user.id).eq("active", true).eq("role", user.role).single();
  if (result.error || !result.data) throw new Error("Sales access unavailable.");
}
/** Privileged reads never leave this server repository without subsequent per-sale assignment checks. */
export async function readSaleEvents(user: CurrentUser): Promise<SaleEvent[]> {
  await authorize(user);
  const events: SaleEvent[] = [];
  for (let offset = 0; offset < 10000; offset += 500) {
    const result = await createAdminClient().from("audit_events").select("id,actor_user_id,entity_id,details,created_at")
      .eq("agency_id", user.agencyId).in("action", ["sunfire.sale_assigned", "sunfire.sale_disposition_updated"])
      .eq("entity_type", "sunfire_collection").order("created_at", { ascending: false }).order("id", { ascending: false }).range(offset, offset + 499);
    if (result.error) throw new Error("Could not read sales history.");
    for (const row of result.data ?? []) {
      const value = row.details as Record<string, unknown>;
      if (!value || value.version !== 1 || typeof value.ownerId !== "string" || !uuid.test(value.ownerId) ||
        typeof value.enrollmentCode !== "string" || !/^[A-Za-z0-9_-]{1,100}$/.test(value.enrollmentCode) ||
        !row.actor_user_id || !row.entity_id || !/^[a-f0-9]{64}$/.test(row.entity_id) || typeof value.actorName !== "string") throw new Error("Invalid sales history.");
      const common = { id: row.id, recordedAt: row.created_at, actorId: row.actor_user_id, actorName: value.actorName,
        ownerId: value.ownerId, enrollmentCode: value.enrollmentCode, collectionHash: row.entity_id };
      if (value.kind === "assignment" && row.actor_user_id === value.ownerId && (value.agentId === null || typeof value.agentId === "string" && uuid.test(value.agentId)))
        events.push({ ...common, kind: "assignment", agentId: value.agentId as string | null });
      else if (value.kind === "disposition" && (policyStatuses as readonly unknown[]).includes(value.status) && typeof value.note === "string" && value.note.trim() && value.note.length <= 2000)
        events.push({ ...common, kind: "disposition", status: value.status as PolicyStatus, note: value.note });
      else throw new Error("Invalid sales history.");
    }
    if ((result.data?.length ?? 0) < 500) return events;
  }
  throw new Error("Sales history exceeds the review limit.");
}
export async function readAuthorizedSaleSource(user: CurrentUser, ownerId: string, hash: string, code: string) {
  const events = await readSaleEvents(user);
  if (!uuid.test(ownerId) || !/^[a-f0-9]{64}$/.test(hash) || !/^[A-Za-z0-9_-]{1,100}$/.test(code) ||
    !(user.role === "owner" && user.id === ownerId || user.role === "agent" && saleAssignment(events, ownerId, hash, code) === user.id)) throw new Error("Sale is not assigned to you.");
  const admin = createAdminClient();
  const owner = await admin.from("users").select("id").eq("agency_id", user.agencyId).eq("id", ownerId).eq("role", "owner").eq("active", true).single();
  const connection = await admin.from("carrier_connections").select("id").eq("agency_id", user.agencyId).eq("user_id", ownerId).eq("carrier", "SunFire").single();
  if (owner.error || !owner.data || connection.error || !connection.data) throw new Error("Sale source unavailable.");
  const path = sunfireStoragePath({ agencyId: user.agencyId, userId: ownerId, connectionId: connection.data.id }, hash);
  const file = await admin.storage.from("statements").download(path);
  if (file.error || !file.data || file.data.size < 1 || file.data.size > SUNFIRE_MAX_BYTES) throw new Error("Sale source unavailable.");
  const bytes = Buffer.from(await file.data.arrayBuffer());
  let collection;
  try { collection = validateSunfireCollection(JSON.parse(bytes.toString("utf8"))); }
  catch { throw new Error("Sale source integrity failed."); }
  if (collection.agencyId !== user.agencyId || collection.userId !== ownerId || collection.connectionId !== connection.data.id || sunfireCollectionHash(collection) !== hash || !sunfireCollectionBytes(collection).equals(bytes)) throw new Error("Sale source integrity failed.");
  const enrollment = collection.records.find(row => row.code === code);
  if (!enrollment) throw new Error("Enrollment unavailable.");
  return enrollment;
}
export async function validateSaleAgent(user: CurrentUser, agentId: string | null) {
  await authorize(user);
  if (user.role !== "owner") throw new Error("Owner required to assign sales.");
  if (agentId === null) return;
  if (!uuid.test(agentId)) throw new Error("Choose an active agent in your agency.");
  const agent = await createAdminClient().from("users").select("id,role").eq("agency_id", user.agencyId).eq("id", agentId).eq("active", true).in("role", ["owner", "agent"]).single();
  if (agent.error || !agent.data || agent.data.role === "owner" && agent.data.id !== user.id) throw new Error("Choose an active agent in your agency.");
}
export async function appendSaleEvent(user: CurrentUser, ownerId: string, hash: string, code: string,
  change: { kind: "assignment"; agentId: string | null } | { kind: "disposition"; status: PolicyStatus; note: string }) {
  // Recheck current assignment at write time; no browser-supplied names or permission claims are trusted.
  await readAuthorizedSaleSource(user, ownerId, hash, code);
  if (change.kind === "assignment") await validateSaleAgent(user, change.agentId);
  else validateDisposition(change.status, change.note);
  const result = await createAdminClient().from("audit_events").insert({ id: randomUUID(), agency_id: user.agencyId, actor_user_id: user.id,
    action: change.kind === "assignment" ? "sunfire.sale_assigned" : "sunfire.sale_disposition_updated", entity_type: "sunfire_collection", entity_id: hash,
    details: { version: 1, ownerId, enrollmentCode: code, actorName: `${user.firstName} ${user.lastName}`, ...change } });
  if (result.error) throw new Error("Could not save the sale change.");
}
