import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/** Session/RLS check precedes any service-role PDF metadata lookup. */
export async function listVisiblePaymentSources(ids: string[], agencyId: string) {
  const session = await createClient();
  // Bound URL size and stay below Supabase's response cap for every request.
  const rows: import("@/types/database").Database["public"]["Tables"]["carrier_transactions"]["Row"][] = [];
  const unique = [...new Set(ids)];
  for (let start = 0; start < unique.length; start += 100) {
    const { data, error } = await session.from("carrier_transactions").select("*")
      .eq("agency_id", agencyId).in("id", unique.slice(start, start + 100));
    if (error) throw new Error("Could not load payment sources");
    rows.push(...(data ?? []));
  }
  return rows;
}

/** Internal metadata only; caller must first authorize the payment using the session. */
export async function getPaymentStatementSource(statementId: string, agencyId: string) {
  const admin = createAdminClient();
  const { data, error } = await admin.from("commission_statements")
    .select("storage_path,file_hash,original_filename,carrier,source_pair_hash,statement_pay_date,devoted_payee_hash,payment_period_start,payment_period_end")
    .eq("agency_id", agencyId).eq("id", statementId).maybeSingle();
  if (error) throw new Error("Could not load the saved statement");
  return data;
}