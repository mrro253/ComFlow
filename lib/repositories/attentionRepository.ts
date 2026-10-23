import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { digest } from "@/lib/carriers/digest";
import type { CurrentUser } from "@/types/domain";
async function authorize(user: CurrentUser) {
  if (!user.active) throw new Error("Active account required.");
  const client = await createClient();
  const result = await client.from("users").select("id").eq("agency_id", user.agencyId).eq("id", user.id).eq("active", true).single();
  if (result.error || !result.data) throw new Error("Attention access unavailable.");
}
export async function reviewedAttentionKeys(user: CurrentUser) {
  await authorize(user);
  const keys = new Set<string>();
  for (let offset = 0; offset < 10000; offset += 500) {
    const result = await createAdminClient().from("audit_events").select("entity_id").eq("agency_id", user.agencyId).eq("actor_user_id", user.id)
      .eq("action", "attention.chargeback_reviewed").eq("entity_type", "carrier_transaction_review").order("id").range(offset, offset + 499);
    if (result.error) throw new Error("Could not read review history.");
    for (const row of result.data ?? []) {
      if (!row.entity_id || !/^[a-f0-9]{64}$/.test(row.entity_id)) throw new Error("Invalid review history.");
      keys.add(row.entity_id);
    }
    if ((result.data?.length ?? 0) < 500) return keys;
  }
  throw new Error("Review history exceeds the current limit.");
}
export async function appendChargebackReview(user: CurrentUser, key: string) {
  await authorize(user);
  if (!/^[a-f0-9]{64}$/.test(key)) throw new Error("Invalid review reference.");
  const hash = digest({ agency: user.agencyId, actor: user.id, action: "attention.chargeback_reviewed", key });
  const id = `${hash.slice(0, 8)}-${hash.slice(8, 12)}-5${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
  const result = await createAdminClient().from("audit_events").insert({ id, agency_id: user.agencyId, actor_user_id: user.id,
    action: "attention.chargeback_reviewed", entity_type: "carrier_transaction_review", entity_id: key, details: { version: 1 } });
  if (result.error && result.error.code !== "23505") throw new Error("Could not save review acknowledgment.");
}
