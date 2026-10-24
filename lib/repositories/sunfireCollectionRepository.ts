import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { SUNFIRE_MAX_BYTES, sunfireCollectionBytes, sunfireCollectionHash, sunfireHashPattern, sunfireStoragePath, validateSunfireCollection } from "@/lib/enrollments/sunfire";
import type { CurrentUser } from "@/types/domain";

async function ownConnection(user: CurrentUser) {
  if (!user.active || user.role !== "owner") throw new Error("SunFire owner access required.");
  const session = await createClient();
  const result = await session.from("carrier_connections").select("id").eq("agency_id", user.agencyId).eq("user_id", user.id).eq("carrier", "SunFire").maybeSingle();
  if (result.error) throw new Error("Could not load your SunFire connection.");
  return result.data;
}
export async function listSunfireCollections(user: CurrentUser) {
  const connection = await ownConnection(user);
  if (!connection) return [];
  const path = sunfireStoragePath({ agencyId: user.agencyId, userId: user.id, connectionId: connection.id }, "0".repeat(64));
  const folder = path.slice(0, path.lastIndexOf("/"));
  const files = await createAdminClient().storage.from("statements").list(folder, { limit: 51, sortBy: { column: "created_at", order: "desc" } });
  if (files.error) throw new Error("Could not list collected enrollments.");
  if ((files.data?.length ?? 0) > 50) throw new Error("Enrollment history exceeds the current collection limit. Older applications have not been discarded.");
  return (files.data ?? []).filter((file) => file.name.endsWith(".json") && sunfireHashPattern.test(file.name.slice(0, -5))).map((file) => ({ hash: file.name.slice(0, -5), collectedAt: file.created_at }));
}
export async function readSunfireCollection(user: CurrentUser, hash: string) {
  if (!sunfireHashPattern.test(hash)) throw new Error("Invalid SunFire collection reference.");
  const connection = await ownConnection(user);
  if (!connection) throw new Error("SunFire connection not found.");
  const path = sunfireStoragePath({ agencyId: user.agencyId, userId: user.id, connectionId: connection.id }, hash);
  const file = await createAdminClient().storage.from("statements").download(path);
  if (file.error || !file.data || file.data.size < 1 || file.data.size > SUNFIRE_MAX_BYTES) throw new Error("SunFire source is missing or oversized.");
  const bytes = Buffer.from(await file.data.arrayBuffer());
  const collection = validateSunfireCollection(JSON.parse(bytes.toString("utf8")));
  if (collection.agencyId !== user.agencyId || collection.userId !== user.id || collection.connectionId !== connection.id || sunfireCollectionHash(collection) !== hash || !sunfireCollectionBytes(collection).equals(bytes)) throw new Error("SunFire source integrity check failed.");
  return collection;
}
