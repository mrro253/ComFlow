import { createClient } from "@/lib/supabase/server";

/** All amounts for this statement, including historical superseded rows. Never use a display limit. */
export async function listStatementAmounts(statementId: string, agencyId: string): Promise<number[]> {
  const session = await createClient();
  const amounts: number[] = [];
  const pageSize = 500, maxRows = 100000;
  for (let from = 0; from < maxRows; from += pageSize) {
    const { data, error } = await session.from("carrier_transactions").select("id,amount_cents")
      .eq("agency_id", agencyId).eq("statement_id", statementId).order("id").range(from, from + pageSize - 1);
    if (error || !data) throw new Error("Could not read all statement amounts");
    amounts.push(...data.map((row) => row.amount_cents));
    if (data.length < pageSize) return amounts;
  }
  throw new Error("Statement amount check exceeded its complete-read limit");
}
