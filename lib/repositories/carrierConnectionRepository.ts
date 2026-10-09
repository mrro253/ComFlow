import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { encryptCarrierLogin, type CarrierLogin } from "@/lib/crypto/credentials";
import type { Database } from "@/types/database";

type ConnectionRow = Database["public"]["Tables"]["carrier_connections"]["Row"];

export interface CarrierConnectionRecord {
  id: string;
  userId: string;
  carrier: string;
  status: ConnectionRow["status"];
  lastSyncAt: string | null;
  lastSuccessfulSyncAt: string | null;
  lastError: string | null;
  syncRequestedAt: string | null;
}

function mapConnection(row: ConnectionRow): CarrierConnectionRecord {
  return {
    id: row.id,
    userId: row.user_id,
    carrier: row.carrier,
    status: row.status,
    lastSyncAt: row.last_sync_at,
    lastSuccessfulSyncAt: row.last_successful_sync_at,
    lastError: row.last_error,
    syncRequestedAt: row.sync_requested_at,
  };
}

/** Connections the signed-in user may see (RLS: Owner sees all, others only their own). */
export async function listVisibleConnections(): Promise<CarrierConnectionRecord[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("carrier_connections")
    .select("*")
    .order("created_at", { ascending: true });
  if (error || !data) return [];
  return data.map(mapConnection);
}

/**
 * Saves (or replaces) a user's carrier portal login. The login is encrypted
 * with the connection id bound in, and the ciphertext lives in a table that
 * the browser-facing roles cannot read. Plaintext is never stored or logged.
 */
export async function saveCarrierLogin(input: {
  agencyId: string;
  userId: string;
  carrier: string;
  login: CarrierLogin;
}): Promise<void> {
  const admin = createAdminClient();

  const { data: connection, error } = await admin
    .from("carrier_connections")
    .upsert(
      {
        agency_id: input.agencyId,
        user_id: input.userId,
        carrier: input.carrier,
        status: "pending" as const,
        last_error: null,
      },
      { onConflict: "agency_id,user_id,carrier" }
    )
    .select("id")
    .single();
  if (error || !connection) throw new Error("Could not save the connection");

  const ciphertext = encryptCarrierLogin(input.login, connection.id);
  const { error: credentialError } = await admin.from("carrier_credentials").upsert(
    {
      connection_id: connection.id,
      agency_id: input.agencyId,
      ciphertext,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "connection_id" }
  );
  if (credentialError) throw new Error("Could not store the login securely");
}

/** Flags a connection so the carrier worker picks it up on its next poll. */
export async function requestSync(agencyId: string, connectionId: string): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin
    .from("carrier_connections")
    .update({ sync_requested_at: new Date().toISOString() })
    .eq("id", connectionId)
    .eq("agency_id", agencyId)
    .neq("status", "disabled");
  if (error) throw new Error("Could not request a sync");
}

/** Deletes the stored login and disables the connection. Imported data is kept. */
export async function disconnectCarrier(agencyId: string, connectionId: string): Promise<void> {
  const admin = createAdminClient();
  await admin.from("carrier_credentials").delete().eq("connection_id", connectionId).eq("agency_id", agencyId);
  const { error } = await admin
    .from("carrier_connections")
    .update({ status: "disabled", sync_requested_at: null })
    .eq("id", connectionId)
    .eq("agency_id", agencyId);
  if (error) throw new Error("Could not disconnect");
}
