import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { CurrentUser } from "@/types/domain";
import type { Database } from "@/types/database";

type Statement = Database["public"]["Tables"]["commission_statements"]["Row"];
type Entry = Database["public"]["Tables"]["carrier_transactions"]["Row"];
/** Read-only, RLS-scoped evidence inventory. Page every query rather than relying on API row caps. */
export async function loadSunfireMatchInventory(user: CurrentUser) {
  if (!user.active || !["owner", "agent"].includes(user.role)) throw new Error("Active owner or agent required.");
  const session = await createClient();
  const statements: Statement[] = [], entries: Entry[] = [];
  if (user.role === "agent") {
    // Shared team statements may be hidden by statement RLS. Authorize individual
    // transactions first, then resolve only their active imported source metadata.
    for (let offset = 0; ; offset += 500) {
      if (offset >= 10000) throw new Error("Commission scope is too large.");
      const result = await session.from("carrier_transactions").select("*").eq("agency_id", user.agencyId).is("superseded_at", null).order("id").range(offset, offset + 499);
      if (result.error) throw new Error("Could not read commission entries.");
      entries.push(...(result.data ?? []));
      if ((result.data?.length ?? 0) < 500) break;
    }
    const ids = [...new Set(entries.map(row => row.statement_id))];
    for (let start = 0; start < ids.length; start += 100) {
      const result = await createAdminClient().from("commission_statements").select("*").eq("agency_id", user.agencyId).eq("status", "imported").is("superseded_at", null).in("id", ids.slice(start, start + 100));
      if (result.error) throw new Error("Could not verify commission sources.");
      statements.push(...(result.data ?? []));
    }
    const active = new Set(statements.map(row => row.id));
    return { statements, entries: entries.filter(row => active.has(row.statement_id)) };
  }
  for (let offset = 0; ; offset += 500) {
    if (offset >= 10000) throw new Error("Statement review scope is too large.");
    const result = await session.from("commission_statements").select("*").eq("agency_id", user.agencyId).eq("status", "imported").is("superseded_at", null).order("id").range(offset, offset + 499);
    if (result.error) throw new Error("Could not read imported statements.");
    statements.push(...(result.data ?? []));
    if ((result.data?.length ?? 0) < 500) break;
  }
  for (let start = 0; start < statements.length; start += 100) {
    for (let offset = 0; ; offset += 500) {
      if (offset >= 10000) throw new Error("Commission review scope is too large.");
      const result = await session.from("carrier_transactions").select("*").eq("agency_id", user.agencyId).is("superseded_at", null).in("statement_id", statements.slice(start, start + 100).map(statement => statement.id)).order("id").range(offset, offset + 499);
      if (result.error) throw new Error("Could not read commission entries.");
      entries.push(...(result.data ?? []));
      if ((result.data?.length ?? 0) < 500) break;
    }
  }
  return { statements, entries };
}
