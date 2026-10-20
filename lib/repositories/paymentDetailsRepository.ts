import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/** Session/RLS check precedes any service-role PDF metadata lookup. */
export async function listVisiblePaymentSources(ids: string[], agencyId: string) {
  const session = await createClient();
  const { data, error } = await session.from("carrier_transactions").select("*")
    .eq("agency_id", agencyId).in("id", ids);
  if (error) throw new Error("Could not load payment sources");
  return data ?? [];
}

/** Internal metadata only; caller must first authorize the payment using the session. */
export async function getPaymentStatementSource(statementId: string, agencyId: string) {
  const admin = createAdminClient();
  const { data, error } = await admin.from("commission_statements")
    .select("storage_path,file_hash,original_filename,carrier")
    .eq("agency_id", agencyId).eq("id", statementId).maybeSingle();
  if (error) throw new Error("Could not load the saved statement");
  return data;
}