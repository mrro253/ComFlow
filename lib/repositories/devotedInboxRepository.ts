import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sha256 } from "@/lib/carriers/digest";
import type { CurrentUser } from "@/types/domain";

const hashPattern = /^[a-f0-9]{64}$/;
async function authorize(user: CurrentUser, connectionId: string) {
  if (!user.active || user.role !== "owner") throw new Error("Owner required");
  const session = await createClient();
  const connection = await session.from("carrier_connections").select("id").eq("id", connectionId).eq("agency_id", user.agencyId).eq("user_id", user.id).eq("carrier", "Devoted Health").maybeSingle();
  if (connection.error || !connection.data) throw new Error("Devoted connection not found");
}
export async function listDevotedInbox(user: CurrentUser) {
  if (!user.active || user.role !== "owner") return [];
  const session = await createClient();
  const connections = await session.from("carrier_connections").select("id").eq("agency_id", user.agencyId).eq("user_id", user.id).eq("carrier", "Devoted Health");
  if (connections.error) throw new Error("Could not load Devoted connections");
  const admin = createAdminClient();
  const imported = await session.from("commission_statements").select("source_pair_hash").eq("agency_id", user.agencyId).eq("carrier", "Devoted Health");
  if (imported.error) throw new Error("Could not check Devoted imports");
  const known = new Set((imported.data ?? []).map((r) => r.source_pair_hash));
  const result: { connectionId: string; pairHash: string; payDate: string }[] = [];
  for (const connection of connections.data ?? []) {
    // Enumerate all pages; two files plus manifest are saved for each pair.
    for (let offset = 0; ; offset += 100) {
      const files = await admin.storage.from("statements").list(`${user.agencyId}/devoted-inbox/${connection.id}`, { limit: 100, offset, sortBy: { column: "name", order: "asc" } });
      if (files.error) throw new Error("Could not load downloaded Devoted pairs");
      for (const file of files.data ?? []) {
        const pairHash = file.name.replace(/\.json$/, "");
        if (file.name.endsWith(".json") && hashPattern.test(pairHash) && !known.has(pairHash)) {
          const manifest = await admin.storage.from("statements").download(`${user.agencyId}/devoted-inbox/${connection.id}/${file.name}`);
          if (manifest.error || !manifest.data || manifest.data.size > 1024) throw new Error("Could not read Devoted review metadata");
          const metadata = JSON.parse(await manifest.data.text()) as { pairHash?: string; payDate?: string };
          if (metadata.pairHash !== pairHash || !/^\d{4}-\d{2}-\d{2}$/.test(metadata.payDate ?? "")) throw new Error("Invalid Devoted review metadata");
          result.push({ connectionId: connection.id, pairHash, payDate: metadata.payDate! });
        }
      }
      if ((files.data?.length ?? 0) < 100) break;
    }
  }
  return result.sort((a, b) => b.payDate.localeCompare(a.payDate));
}
export async function readDevotedInbox(user: CurrentUser, connectionId: string, pairHash: string) {
  if (!hashPattern.test(pairHash)) throw new Error("Invalid source reference");
  await authorize(user, connectionId);
  const bucket = createAdminClient().storage.from("statements");
  const base = `${user.agencyId}/devoted-inbox/${connectionId}/${pairHash}`;
  async function read(ext: string, max: number) {
    const file = await bucket.download(`${base}.${ext}`);
    if (file.error || !file.data || file.data.size < 1 || file.data.size > max) throw new Error("Missing or oversized Devoted source");
    return new Uint8Array(await file.data.arrayBuffer());
  }
  const manifest = JSON.parse(new TextDecoder().decode(await read("json", 1024))) as { pairHash?: string; pdfHash?: string; workbookHash?: string };
  const [pdf, workbook] = await Promise.all([read("pdf", 15728640), read("xlsx", 15728640)]);
  if (manifest.pairHash !== pairHash || manifest.pdfHash !== sha256(pdf) || manifest.workbookHash !== sha256(workbook) || sha256(JSON.stringify(["devoted-pair-v1", sha256(pdf), sha256(workbook)])) !== pairHash) throw new Error("Devoted pair integrity check failed");
  return { pdf, workbook };
}
