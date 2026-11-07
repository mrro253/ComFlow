/** Separate authenticated accounts against an isolated database; all other network traffic is blocked. */
import { randomBytes, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { commissionCreditRows } from "../lib/reporting/commissionCredit";
import type { Database } from "../types/database";

function check(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}
function checked<T extends { data: unknown; error: unknown }>(result: T, message: string): T["data"] {
  check(!result.error, message);
  return result.data;
}

async function main() {
  const url = process.env.API_URL;
  check(process.env.GHL_AUTOMATION_SYNTHETIC_ONLY === "true" && url === "http://127.0.0.1:55431", "Isolated synthetic project required.");
  check(process.env.ANON_KEY && process.env.SERVICE_ROLE_KEY, "Isolated test keys required.");
  const nativeFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const target = new URL(input instanceof Request ? input.url : String(input));
    check(target.origin === url, "External traffic blocked by account isolation drill.");
    return nativeFetch(input, init);
  }) as typeof fetch;
  const options = { auth: { persistSession: false, autoRefreshToken: false } };
  const admin = createClient<Database>(url, process.env.SERVICE_ROLE_KEY, options);
  const agency = randomUUID(), foreignAgency = randomUUID();
  const authIds: string[] = [];
  const shared = randomUUID(), personal = randomUUID(), foreignConnection = randomUUID();
  const statement = randomUUID(), foreignStatement = randomUUID();
  const splitEntry = randomUUID(), transferEntry = randomUUID(), secondEntry = randomUUID();
  const sourcePath = `${agency}/synthetic-account-access.pdf`;
  const clients: SupabaseClient<Database>[] = [];
  let owner = "", agentA = "", agentB = "", foreignOwner = "";
  async function account(label: string, agencyId: string, role: "owner" | "agent") {
    const email = `access-${label}-${agency}@synthetic.invalid`;
    const password = randomBytes(24).toString("base64url");
    const auth = checked(await admin.auth.admin.createUser({ email, password, email_confirm: true }), "Could not create synthetic auth account.");
    check(auth.user, "Synthetic auth identity missing.");
    const id = auth.user.id;
    authIds.push(id);
    checked(await admin.from("users").insert({ id, agency_id: agencyId, first_name: "Synthetic", last_name: label, email, role, agent_type: "independent", active: true }), "Could not create synthetic profile.");
    const client = createClient<Database>(url!, process.env.ANON_KEY!, options);
    checked(await client.auth.signInWithPassword({ email, password }), "Synthetic sign-in failed.");
    clients.push(client);
    return { id, client };
  }
  async function visibleIds(client: SupabaseClient<Database>) {
    const rows = checked(await client.from("carrier_transactions").select("id"), "Could not read authenticated commissions.") ?? [];
    return rows.map(row => row.id).sort();
  }
  async function creditedTotal(client: SupabaseClient<Database>, userId: string) {
    const rows = checked(await client.from("carrier_transactions").select("id,user_id,amount_cents"), "Could not read financial rows.") ?? [];
    const shares = checked(await client.from("commission_allocations").select("*"), "Could not read recipient shares.") ?? [];
    const markers = checked(await client.from("commission_split_entries").select("transaction_id"), "Could not read split markers.") ?? [];
    check(shares.every(share => share.user_id === userId), "Another agent's split allocation leaked.");
    const credit = commissionCreditRows({ id: userId, role: "agent", agentType: "independent" }, rows.map(row => ({
      userId: row.user_id, amountCents: row.amount_cents,
      hasCommissionSplit: markers.some(marker => marker.transaction_id === row.id),
      allocations: shares.filter(share => share.transaction_id === row.id).map(share => ({ userId: share.user_id, amountCents: share.amount_cents, basisPoints: share.basis_points })),
    })));
    return credit.reduce((sum, row) => sum + (row.amountCents ?? 0), 0);
  }
  async function reviewHash(entry: string) {
    const review = checked(await admin.rpc("review_policy_commission_owner", { p_actor: owner, p_agency: agency, p_entry: entry }), "Could not review synthetic policy.");
    const hash = (review as { reviewHash?: string })?.reviewHash;
    check(hash, "Synthetic review fingerprint missing.");
    return hash;
  }
  try {
    checked(await admin.from("agencies").insert([{ id: agency, name: "Synthetic authenticated account drill" }, { id: foreignAgency, name: "Synthetic foreign agency" }]), "Could not create test agencies.");
    owner = (await account("Owner", agency, "owner")).id;
    const a = await account("AgentA", agency, "agent"); agentA = a.id;
    const b = await account("AgentB", agency, "agent"); agentB = b.id;
    const foreign = await account("Foreign", foreignAgency, "owner"); foreignOwner = foreign.id;
    checked(await admin.from("production_entities").insert([
      { agency_id: agency, user_id: owner, entity_type: "personal", name: "Synthetic owner personal" },
      { agency_id: agency, entity_type: "agency", name: "Synthetic agency production" },
    ]), "Could not create test production categories.");
    checked(await admin.from("commission_statements").insert([
      { id: statement, agency_id: agency, user_id: owner, carrier: "Synthetic Account Drill", statement_month: "2026-03", source: "upload", file_hash: randomBytes(32).toString("hex"), storage_path: sourcePath, status: "imported" },
      { id: foreignStatement, agency_id: foreignAgency, user_id: foreignOwner, carrier: "Synthetic Account Drill", statement_month: "2026-03", source: "upload", file_hash: randomBytes(32).toString("hex"), status: "imported" },
    ]), "Could not create synthetic source records.");
    const base = { agency_id: agency, statement_id: statement, carrier: "Synthetic Account Drill", statement_month: "2026-03", effective_date: "2026-03-01", commission_type: "COMMISSION", writing_agent_name: "SYNTHETIC AGENT A", writing_agent_verified: true };
    checked(await admin.from("carrier_transactions").insert([
      { ...base, id: splitEntry, carrier_member_id: "SYNTH-SHARED", amount_cents: 10001, transaction_key: randomUUID(), user_id: agentA },
      { ...base, id: transferEntry, carrier_member_id: "SYNTH-TRANSFER", amount_cents: 5000, transaction_key: randomUUID(), user_id: agentA },
      { ...base, id: secondEntry, carrier_member_id: "SYNTH-SECOND", amount_cents: 20000, transaction_key: randomUUID(), user_id: agentB },
      { ...base, id: randomUUID(), agency_id: foreignAgency, statement_id: foreignStatement, carrier_member_id: "SYNTH-FOREIGN", amount_cents: 30000, transaction_key: randomUUID(), user_id: foreignOwner },
    ]), "Could not create synthetic commission rows.");
    check(JSON.stringify(await visibleIds(a.client)) === JSON.stringify([splitEntry, transferEntry].sort()), "Agent A read another agent's commission.");
    check(JSON.stringify(await visibleIds(b.client)) === JSON.stringify([secondEntry]), "Agent B read another agent's commission.");
    check((await visibleIds(foreign.client)).length === 1, "Foreign owner crossed agency boundaries.");
    check(Boolean((await a.client.from("carrier_transactions").update({ user_id: agentA }).eq("id", secondEntry)).error), "Agent could directly change another policy's owner.");
    checked(await admin.storage.from("statements").upload(sourcePath, Buffer.from("%PDF-synthetic isolated access fixture")), "Could not create private test source.");
    check(Boolean((await a.client.storage.from("statements").download(sourcePath)).error), "Private PDF was directly downloadable by an agent.");

    const splitArgs = { p_actor: owner, p_agency: agency, p_entry: splitEntry, p_first: agentA, p_second: agentB, p_basis_points: 6000, p_enabled: true, p_reason: "Synthetic 60/40 agreement", p_review_hash: await reviewHash(splitEntry) };
    checked(await admin.rpc("save_policy_commission_split", splitArgs), "Synthetic split save failed.");
    check(await creditedTotal(a.client, agentA) === 11001, "Agent A's dashboard credit included the wrong split amount.");
    check(await creditedTotal(b.client, agentB) === 24000, "Agent B's dashboard credit included the full source commission.");
    check(Boolean((await a.client.rpc("save_policy_commission_split", splitArgs)).error), "Agent could invoke the owner-only split operation.");
    const ownership = await admin.rpc("save_policy_commission_owner", { p_actor: owner, p_agency: agency, p_entry: transferEntry, p_owner: agentB, p_reason: "Synthetic selected-policy transfer", p_review_hash: await reviewHash(transferEntry) });
    check(!ownership.error, `Synthetic selected-policy ownership change failed: ${ownership.error?.message ?? "unknown"}`);
    check(await creditedTotal(a.client, agentA) === 6001 && await creditedTotal(b.client, agentB) === 29000, "Ownership transfer crossed policies or double-counted the original writer.");
    const preserved = checked(await admin.from("carrier_transactions").select("amount_cents,writing_agent_name,writing_user_id").eq("id", transferEntry).single(), "Could not verify original source.");
    check(preserved && preserved.amount_cents === 5000 && preserved.writing_agent_name === "SYNTHETIC AGENT A" && preserved.writing_user_id === agentA, "Ownership changed printed source evidence.");

    for (const [id, actor, agencyId, mode, location] of [[shared, owner, agency, "shared", "SyntheticShared"], [personal, agentA, agency, "personal", "SyntheticPersonal"], [foreignConnection, foreignOwner, foreignAgency, "personal", "SyntheticForeign"]] as const) {
      checked(await admin.rpc("manage_ghl_connection", { p_actor: actor, p_agency: agencyId, p_action: "save", p_data: { id, mode, locationId: location, locationName: location, ciphertext: "v1.synthetic" } }), "Could not create synthetic GHL setup.");
    }
    for (const [id, ghl] of [[agentA, "SyntheticAgentA"], [agentB, "SyntheticAgentB"]]) {
      checked(await admin.rpc("manage_ghl_connection", { p_actor: owner, p_agency: agency, p_action: "map", p_data: { id: shared, userId: id, ghlUserId: ghl } }), "Could not map synthetic agent.");
    }
    for (const [client, expected] of [[a.client, [shared, personal]], [b.client, [shared]], [foreign.client, [foreignConnection]]] as const) {
      const connections = checked(await client.from("ghl_connections").select("id"), "Could not read authorized GHL setup.") ?? [];
      check(JSON.stringify(connections.map(row => row.id).sort()) === JSON.stringify([...expected].sort()), "Personal/shared GHL connections crossed accounts.");
      check(Boolean((await client.from("ghl_credentials").select("*")).error), "A browser account could read saved GHL credentials.");
    }
    for (const [client, id] of [[a.client, agentA], [b.client, agentB]] as const) {
      const mappings = checked(await client.from("ghl_agent_mappings").select("user_id"), "Could not check GHL mapping visibility.") ?? [];
      check(mappings.length === 1 && mappings[0].user_id === id, "Another agent's GHL mapping leaked.");
    }
    checked(await admin.from("users").update({ active: false }).eq("id", agentA).eq("agency_id", agency), "Could not deactivate synthetic account.");
    check((await visibleIds(a.client)).length === 0, "Existing agent session retained commissions after deactivation.");
    check((checked(await a.client.from("commission_allocations").select("*"), "Could not check revoked split access.") ?? []).length === 0, "Inactive account retained split access.");
    check((checked(await a.client.from("ghl_connections").select("id"), "Could not check revoked GHL access.") ?? []).length === 0, "Inactive account retained GHL setup access.");
    console.log("PASS authenticated Agent A / Agent B / foreign owner: commission isolation, private sources, 60/40 rounding, selected-policy ownership, owner-only changes, personal/shared GHL setup, hidden credentials and inactive-session revocation. External requests: zero.");
  } finally {
    // Only generated fixture agencies/identities; no existing rows or schema are modified.
    // Fixture audits are append-only through the API. Delete only these two
    // generated agencies' audits in the explicitly isolated PostgreSQL session.
    execFileSync("docker", ["exec", "-i", "supabase_db_commissionflow-devoted-review", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1"], {
      input: `BEGIN; SET LOCAL session_replication_role=replica; DELETE FROM public.audit_events WHERE agency_id IN ('${agency}','${foreignAgency}'); COMMIT;`,
      stdio: ["pipe", "pipe", "pipe"],
    });
    for (const table of ["commission_allocations", "commission_split_entries", "policy_commission_splits", "policy_commission_owners", "ghl_connections", "carrier_transactions", "commission_statements", "production_entities"] as const) {
      checked(await admin.from(table).delete().in("agency_id", [agency, foreignAgency]), `Synthetic cleanup failed for ${table}.`);
    }
    await admin.storage.from("statements").remove([sourcePath]);
    for (const id of authIds.reverse()) {
      checked(await admin.from("users").delete().eq("id", id).in("agency_id", [agency, foreignAgency]), "Synthetic profile cleanup failed.");
      checked(await admin.auth.admin.deleteUser(id), "Synthetic auth cleanup failed.");
    }
    checked(await admin.from("agencies").delete().in("id", [agency, foreignAgency]), "Synthetic agency cleanup failed.");
    for (const client of clients) await client.auth.signOut({ scope: "local" });
    globalThis.fetch = nativeFetch;
  }
}
main().catch(error => { console.error("Authenticated account drill failed:", error instanceof Error ? error.message : "Unknown failure"); process.exitCode = 1; });
