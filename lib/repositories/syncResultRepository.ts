import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { readSyncResult, type SyncResult } from "@/lib/carriers/syncResult";

export async function loadSyncResult(connectionId: string, agencyId: string): Promise<SyncResult | null> {
  // Authorize through RLS before reading any service-role storage object.
  const session = await createClient();
  const { data: connection, error } = await session.from("carrier_connections").select("id,agency_id,carrier")
    .eq("id", connectionId).eq("agency_id", agencyId).maybeSingle();
  if (error || !connection) return null;
  try {
    const { data, error: storageError } = await createAdminClient().storage.from("statements")
      .download(`${connection.agency_id}/sync-results/${connection.id}/latest.json`);
    if (storageError || !data || data.size > 4096) return null;
    return readSyncResult(JSON.parse(await data.text()), connection.id, connection.carrier);
  } catch { return null; }
}
