import { createServer } from "node:http";
import { parseVerification, relayKey, verificationAuthenticator } from "../../lib/carriers/verificationProtocol.js";
import { createDb } from "./db.js";
import { handleVerification } from "./verificationSessions.js";

/** Private worker endpoint. Publish only through an authenticated HTTPS gateway. */
export async function startVerificationServer() {
  if (process.env.CARRIER_BROWSER_MODE !== "hosted" || process.env.HOSTED_VERIFICATION_ENABLED !== "true") return;
  const authenticate = verificationAuthenticator(relayKey(process.env.WORKER_VERIFICATION_KEY));
  const server = createServer(async (req, res) => {
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    const reply = (status: number, data: unknown) => { res.writeHead(status, { "Content-Type": "application/json" }); res.end(JSON.stringify(data)); };
    try {
      if (req.method !== "POST" || req.url !== "/verification" || req.headers["content-type"] !== "application/json") { reply(404, { error: "Unavailable" }); return; }
      let body = "";
      for await (const chunk of req) {
        body += chunk.toString();
        if (Buffer.byteLength(body) > 2048) { reply(413, { error: "Request too large" }); return; }
      }
      if (!authenticate(body, String(req.headers["x-relay-time"] ?? ""), String(req.headers["x-relay-nonce"] ?? ""), String(req.headers["x-relay-signature"] ?? ""))) { reply(401, { error: "Unauthorized" }); return; }
      const input = parseVerification(JSON.parse(body));
      const db = createDb();
      const [user, connection] = await Promise.all([
        db.from("users").select("id,agency_id,active,role,agent_type").eq("id", input.userId).eq("agency_id", input.agencyId).maybeSingle(),
        db.from("carrier_connections").select("id,status").eq("id", input.connectionId).eq("user_id", input.userId).eq("agency_id", input.agencyId).neq("status", "disabled").maybeSingle(),
      ]);
      if (user.error || connection.error || !user.data?.active || !connection.data || !(user.data.role === "owner" || user.data.role === "agent" && user.data.agent_type === "independent")) { reply(403, { error: "Verification unavailable" }); return; }
      reply(200, await handleVerification(input));
    } catch { reply(409, { error: "Verification could not complete. Check the connection before trying again." }); }
  });
  server.requestTimeout = 10_000;
  server.headersTimeout = 10_000;
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(Number(process.env.WORKER_VERIFICATION_PORT ?? 8080), "127.0.0.1", resolve);
  });
  return server;
}
