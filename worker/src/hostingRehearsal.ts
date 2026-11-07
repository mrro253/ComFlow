/** Local, network-isolated fixtures only. Never reads a real database or carrier. */
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { request as httpsRequest } from "node:https";
import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile, access, unlink } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { createBackgroundSession, setVerificationVisible } from "./backgroundBrowser.js";
import { startVerificationServer } from "./verificationServer.js";
import { openLocalRuntime } from "./localRuntime.js";
import { recoverInterruptedSync } from "./scheduledSync.js";
import { createDb } from "./db.js";
import { signVerification, type VerificationRequest, type VerificationState } from "../../lib/carriers/verificationProtocol.js";

const directory = "/state/rehearsal";
const id = "11111111-1111-4111-8111-111111111111";
const agencyId = "22222222-2222-4222-8222-222222222222";
const userId = "33333333-3333-4333-8333-333333333333";
const inactiveId = "44444444-4444-4444-8444-444444444444";
const input: VerificationRequest = { connectionId: id, agencyId, userId, action: "state" };
if (process.env.COMFLOW_REHEARSAL !== "synthetic" || process.env.NEXT_PUBLIC_SUPABASE_URL !== "http://127.0.0.1:18081") throw new Error("Rehearsal requires isolated synthetic configuration");
if (process.getuid?.() === 0) throw new Error("Rehearsal must run without root");

async function serve() {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await unlink(`${directory}/ready.json`).catch(() => undefined);
  for (const path of ["/app/.env", "/app/.env.local", "/app/.pgtest", "/app/.git"]) await assert.rejects(access(path));
  const key = randomBytes(32).toString("base64");
  process.env.WORKER_VERIFICATION_KEY = key;
  await writeFile(`${directory}/relay.key`, key, { mode: 0o600 });
  if (!await access(`${directory}/tls.crt`).then(() => true, () => false)) {
    const tls = spawnSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1", "-keyout", `${directory}/tls.key`, "-out", `${directory}/tls.crt`, "-subj", "/CN=localhost", "-addext", "subjectAltName=DNS:localhost,IP:127.0.0.1"], { stdio: "ignore" });
    assert.equal(tls.status, 0); // Local self-signed certificate; never disable TLS validation.
  }
  const runtime = await openLocalRuntime(`${directory}/runtime`);
  const prior = await runtime.read();
  const run = prior ?? { connectionId: id, startedAt: new Date().toISOString() };
  let recoveryWrites = 0;
  const connection = { id, agency_id: agencyId, user_id: userId, status: "needs_attention", last_sync_at: run.startedAt, last_error: "Sync running. Starting this update.", sync_requested_at: null };
  const dbServer = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1:18081");
    const matches = (field: string, value: string) => url.searchParams.get(field) === `eq.${value}`;
    let body: unknown = [];
    if (url.pathname === "/rest/v1/users") {
      if (matches("agency_id", agencyId) && (matches("id", userId) || matches("id", inactiveId))) body = [{ id: userId, agency_id: agencyId, active: matches("id", userId), role: "owner", agent_type: "independent" }];
    } else if (url.pathname === "/rest/v1/carrier_connections") {
      if (req.method === "PATCH") {
        assert(matches("id", id)); let raw = ""; for await (const chunk of req) raw += chunk;
        const update = JSON.parse(raw); assert.match(update.last_error, /^Update interrupted/); recoveryWrites++; Object.assign(connection, update);
      } else if (matches("id", id) && (!url.searchParams.has("user_id") || matches("user_id", userId)) && (!url.searchParams.has("agency_id") || matches("agency_id", agencyId))) body = [connection];
    } else assert.equal(url.pathname, "/rest/v1/ghl_import_jobs");
    res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify(body));
  });
  await new Promise<void>(resolve => dbServer.listen(18081, "127.0.0.1", resolve));
  if (prior) { await recoverInterruptedSync(createDb(), prior); assert.equal(recoveryWrites, 1); await runtime.write(null); }
  await runtime.write(run);
  // Load and execute the actual worker's empty-queue startup path in the image.
  // The fixture API is loopback-only; this container has no external network.
  // spawnSync would block the fixture server, so use asynchronous spawn below.
  const { spawn } = await import("node:child_process");
  const child = spawn(process.execPath, ["worker/node_modules/tsx/dist/cli.mjs", "--tsconfig", "worker/tsconfig.json", "worker/src/index.ts", "--once"], { env: { ...process.env, HOSTED_VERIFICATION_ENABLED: "false" }, stdio: ["ignore", "pipe", "pipe"] });
  let output = ""; child.stdout.on("data", chunk => { output += chunk; }); child.stderr.on("data", chunk => { output += chunk; });
  const exit = await new Promise<number | null>(resolve => child.on("exit", resolve));
  assert.equal(exit, 0, "Worker startup failed"); assert.match(output, /processed 0 sync request/);
  const relay = await startVerificationServer(); assert(relay);
  const session = await createBackgroundSession({ acceptDownloads: false }, id);
  let pages = 0;
  await session.page.route("**/*", async route => {
    pages++;
    const path = new URL(route.request().url()).pathname;
    const body = path === "/verify" ? `<h1>Verify Your Identity</h1><button onclick="location.assign('/code')">Via Text Message</button>` : path === "/code" ? `<h1>Enter security code</h1><input name="code" autocomplete="one-time-code"><button onclick="location.assign('/complete')">Verify</button>` : "<h1>Carrier dashboard</h1>";
    await route.fulfill({ contentType: "text/html", body });
  });
  await session.page.goto("https://identity.onehealthcareid.com/verify");
  await setVerificationVisible(session.page, true);
  await writeFile(`${directory}/ready.json`, JSON.stringify({ ready: true, recovered: Boolean(prior), recoveryWrites, emptyQueueStartup: true, uid: process.getuid?.() }));
  console.log(`Synthetic rehearsal ready; restart recovery ${prior ? "passed" : "not yet tested"}.`);
  session.page.on("framenavigated", () => {
    if (session.page.url().endsWith("/complete")) {
      assert.equal(pages, 3);
      void setVerificationVisible(session.page, false);
    }
  });
  process.once("SIGTERM", () => { void (async () => { await session.browser.close(); relay.close(); dbServer.close(); await runtime.close(); process.exit(0); })(); });
}

async function verify() {
  const key = await readFile(`${directory}/relay.key`, "utf8"), ca = await readFile(`${directory}/tls.crt`);
  async function call(body: string, headers: Record<string, string> = {}, path = "/verification") {
    return await new Promise<{ status: number; body: string }>((resolve, reject) => {
      const req = httpsRequest({ hostname: "localhost", port: 8443, path, method: "POST", ca, headers: { "Content-Type": "application/json", ...headers }, timeout: 5000 }, res => {
        let text = ""; res.on("data", chunk => { text += chunk; }); res.on("end", () => resolve({ status: res.statusCode ?? 0, body: text }));
      }); req.on("error", reject); req.on("timeout", () => req.destroy(new Error("Rehearsal timeout"))); req.end(body);
    });
  }
  function signed(body: string) { const s = signVerification(body, key); return { "X-Relay-Time": s.stamp, "X-Relay-Nonce": s.nonce, "X-Relay-Signature": s.signature }; }
  async function send(value: VerificationRequest): Promise<VerificationState> { const body = JSON.stringify(value); const r = await call(body, signed(body)); assert.equal(r.status, 200); return JSON.parse(r.body); }
  assert.equal((await call("{}", {}, "/debug")).status, 404);
  assert.equal((await call(JSON.stringify(input))).status, 401);
  const raw = JSON.stringify(input), signature = signed(raw);
  assert.equal((await call(raw, signature)).status, 200);
  assert.equal((await call(raw, signature)).status, 401);
  for (const value of [{ ...input, userId: inactiveId }, { ...input, agencyId: inactiveId }, { ...input, connectionId: inactiveId }]) { const body = JSON.stringify(value); assert.equal((await call(body, signed(body))).status, 403); }
  const delivery = await send(input); assert.deepEqual(delivery.choices, ["sms"]);
  await send({ ...input, action: "sms", sessionId: delivery.sessionId });
  let code: VerificationState = { status: "waiting" };
  for (let i = 0; i < 20; i++) { code = await send(input); if (code.acceptsCode) break; await new Promise(r => setTimeout(r, 100)); }
  assert.equal(code.acceptsCode, true);
  await send({ ...input, action: "code", sessionId: code.sessionId, code: "123456" });
  await new Promise(r => setTimeout(r, 300));
  assert.equal((await send(input)).status, "waiting");
  await writeFile(`${directory}/verified.json`, JSON.stringify({ tlsValidated: true, unsignedDenied: true, replayDenied: true, foreignAndInactiveDenied: true, deliveryAndCode: true, fullBrowserHidden: true }));
  console.log("HTTPS gateway, access isolation, replay rejection and headless MFA checks passed.");
}
const command = process.argv[2];
if (command === "serve") await serve();
else if (command === "verify") await verify();
else throw new Error("Use serve or verify");
