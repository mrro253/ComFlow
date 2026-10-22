import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { digest } from "@/lib/carriers/digest";
import type { CurrentUser } from "@/types/domain";
import type { SunfireFollowup } from "@/lib/enrollments/followup";
async function authorize(user: CurrentUser, hash: string) {
  if (!user.active || user.role !== "owner" || !/^[a-f0-9]{64}$/.test(hash)) throw new Error("Active owner and valid collection required.");
  const client = await createClient();
  const result = await client.from("users").select("id").eq("id", user.id).eq("agency_id", user.agencyId).eq("active", true).eq("role", "owner").single();
  if (result.error || !result.data) throw new Error("Owner access unavailable.");
}
export async function readSunfireFollowups(user: CurrentUser, hash: string): Promise<Record<string, SunfireFollowup>> {
  await authorize(user, hash);
  const records: Record<string, SunfireFollowup> = Object.create(null);
  for (let offset = 0; offset < 10000; offset += 500) {
    const result = await createAdminClient().from("audit_events").select("details,created_at")
      .eq("agency_id", user.agencyId).eq("actor_user_id", user.id).eq("action", "sunfire.enrollment_followup_recorded")
      .eq("entity_type", "sunfire_collection").eq("entity_id", hash).order("created_at", { ascending: false }).order("id", { ascending: false }).range(offset, offset + 499);
    if (result.error) throw new Error("Could not read enrollment follow-up notes.");
    for (const event of result.data ?? []) {
      const value = event.details as { version?: unknown; enrollmentCode?: unknown; status?: unknown; note?: unknown };
      if (value?.version !== 1 || typeof value.enrollmentCode !== "string" || !/^[A-Za-z0-9_-]{1,100}$/.test(value.enrollmentCode) ||
        value.status !== "did_not_take_effect" || typeof value.note !== "string" || !value.note.trim() || value.note.length > 2000) throw new Error("Invalid enrollment follow-up note.");
      if (!records[value.enrollmentCode]) records[value.enrollmentCode] = { enrollmentCode: value.enrollmentCode, status: value.status, note: value.note, recordedAt: event.created_at };
    }
    if ((result.data?.length ?? 0) < 500) return records;
  }
  throw new Error("Too many enrollment follow-up notes.");
}
export async function appendSunfireFollowup(user: CurrentUser, hash: string, enrollmentCode: string, note: string) {
  await authorize(user, hash);
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(enrollmentCode) || !note.trim() || note.length > 2000) throw new Error("Enter an enrollment and a note of up to 2,000 characters.");
  const previous = (await readSunfireFollowups(user, hash))[enrollmentCode];
  if (previous?.note === note) return;
  const key = digest({ agency: user.agencyId, owner: user.id, hash, enrollmentCode, note, status: "did_not_take_effect", previous: previous?.recordedAt ?? null });
  const id = `${key.slice(0, 8)}-${key.slice(8, 12)}-5${key.slice(13, 16)}-a${key.slice(17, 20)}-${key.slice(20, 32)}`;
  const result = await createAdminClient().from("audit_events").insert({ id, agency_id: user.agencyId, actor_user_id: user.id,
    action: "sunfire.enrollment_followup_recorded", entity_type: "sunfire_collection", entity_id: hash,
    details: { version: 1, enrollmentCode, status: "did_not_take_effect", note } });
  if (result.error && result.error.code !== "23505") throw new Error("Could not save enrollment follow-up.");
}
