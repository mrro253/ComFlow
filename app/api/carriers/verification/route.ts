import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { canManageCarrierLogin } from "@/lib/auth/carrierAccess";
import { createClient } from "@/lib/supabase/server";
import { parseVerification, relayKey, signVerification } from "@/lib/carriers/verificationProtocol";

export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
export async function POST(request: Request) {
  const reply = (value: unknown, status = 200) => Response.json(value, { status, headers });
  if (process.env.HOSTED_VERIFICATION_ENABLED !== "true") return reply({ error: "Unavailable" }, 404);
  if (request.headers.get("origin") !== new URL(request.url).origin || !request.headers.get("content-type")?.startsWith("application/json")) return reply({ error: "Unauthorized" }, 403);
  const user = await getCurrentUser();
  if (!user || !canManageCarrierLogin(user)) return reply({ error: "Unauthorized" }, 401);
  try {
    // Bound the stream, including requests without Content-Length.
    const reader = request.body?.getReader();
    if (!reader) return reply({ error: "Invalid request" }, 400);
    const chunks: Uint8Array[] = []; let size = 0;
    for (;;) { const next = await reader.read(); if (next.done) break; size += next.value.length; if (size > 2048) { await reader.cancel(); return reply({ error: "Request too large" }, 413); } chunks.push(next.value); }
    const client = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    const input = parseVerification({ ...client, agencyId: user.agencyId, userId: user.id });
    const db = await createClient();
    const connection = await db.from("carrier_connections").select("id").eq("id", input.connectionId).eq("user_id", user.id).eq("agency_id", user.agencyId).neq("status", "disabled").maybeSingle();
    if (connection.error || !connection.data) return reply({ error: "Verification unavailable" }, 403);
    const endpoint = new URL(process.env.WORKER_VERIFICATION_URL ?? "");
    if (endpoint.protocol !== "https:" || endpoint.username || endpoint.password || endpoint.search || endpoint.hash || endpoint.pathname !== "/verification") throw new Error("Invalid relay URL");
    const body = JSON.stringify(input), signature = signVerification(body, relayKey(process.env.WORKER_VERIFICATION_KEY));
    const response = await fetch(endpoint, { method: "POST", redirect: "error", cache: "no-store", signal: AbortSignal.timeout(8000), headers: { "Content-Type": "application/json", "X-Relay-Time": signature.stamp, "X-Relay-Nonce": signature.nonce, "X-Relay-Signature": signature.signature }, body });
    if (!response.ok) return reply({ error: "Verification could not complete. Check the connection before trying again." }, 409);
    const state = await response.json();
    // Only return the normalized form state; never relay carrier HTML or screenshots.
    if (!["ready", "waiting", "unavailable"].includes(state.status)) throw new Error("Invalid relay response");
    return reply({ status: state.status, sessionId: state.sessionId, acceptsCode: state.acceptsCode === true, choices: Array.isArray(state.choices) ? state.choices.filter((v: unknown) => ["sms", "call", "resend"].includes(String(v))) : [] });
  } catch { return reply({ error: "Verification is temporarily unavailable. Your carrier browser remains hidden." }, 409); }
}
