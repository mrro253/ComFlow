import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";
import type { CRMConnection, CRMProviderId } from "@/types/domain";

type ConnectionRow = Database["public"]["Tables"]["crm_connections"]["Row"];

function mapConnectionRow(row: ConnectionRow): CRMConnection {
  return {
    id: row.id,
    agencyId: row.agency_id,
    provider: row.provider as CRMProviderId,
    accessToken: row.access_token,
    refreshToken: row.refresh_token,
    lastSyncAt: row.last_sync_at,
    createdAt: row.created_at,
  };
}

export async function getConnectionForAgency(
  agencyId: string
): Promise<CRMConnection | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("crm_connections")
    .select("*")
    .eq("agency_id", agencyId)
    .maybeSingle();

  if (error || !data) return null;
  return mapConnectionRow(data);
}

/**
 * Creates or updates the agency's CRM connection.
 *
 * TODO: `accessToken`/`refreshToken` are stored as plaintext for MVP speed.
 * Before handling real credentials, encrypt at rest (e.g. Supabase Vault or
 * pgsodium) rather than storing raw tokens in the table.
 */
export async function upsertConnection(input: {
  agencyId: string;
  provider: CRMProviderId;
  accessToken?: string | null;
  refreshToken?: string | null;
}): Promise<CRMConnection> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("crm_connections")
    .upsert(
      {
        agency_id: input.agencyId,
        provider: input.provider,
        access_token: input.accessToken ?? null,
        refresh_token: input.refreshToken ?? null,
      },
      { onConflict: "agency_id" }
    )
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to save CRM connection");
  }
  return mapConnectionRow(data);
}

export async function markSynced(connectionId: string): Promise<void> {
  const supabase = await createClient();
  await supabase
    .from("crm_connections")
    .update({ last_sync_at: new Date().toISOString() })
    .eq("id", connectionId);
}
