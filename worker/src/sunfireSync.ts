import { chromium, type Browser, type Page } from "playwright";
import { decryptCarrierLogin } from "../../lib/crypto/credentials";
import { SUNFIRE_MAX_BYTES, localDate, sunfireCollectionBytes, sunfireCollectionHash, sunfireDate, sunfirePortalUrl, sunfireStoragePath } from "../../lib/enrollments/sunfire";
import { loadCiphertext, markConnection, type ConnectionRow, type Db } from "./db.js";
import { automaticCarrierLogin } from "./carrierLogin.js";
import { SafePortalError } from "./carriers/types.js";
import type { CollectedEnrollment } from "./sunfire/enrollment.js";
import { sha256 } from "../../lib/carriers/digest";

const sessions = new Map<string, { browser: Browser; page: Page; portal: string; credentialFingerprint: string }>();
async function requireActiveOwner(db: Db, connection: ConnectionRow) {
  const owner = await db.from("users").select("role,active").eq("id", connection.user_id).eq("agency_id", connection.agency_id).maybeSingle();
  if (owner.error || owner.data?.role !== "owner" || !owner.data.active) throw new SafePortalError("SunFire collection requires an active owner connection.");
}
export async function storeSunfireCollection(db: Db, connection: ConnectionRow, start: string, end: string, records: CollectedEnrollment[]) {
  await requireActiveOwner(db, connection);
  const current = await db.from("carrier_connections").select("status").eq("id", connection.id).eq("agency_id", connection.agency_id).eq("user_id", connection.user_id).eq("carrier", "SunFire").maybeSingle();
  if (current.error || !current.data || current.data.status === "disabled") throw new SafePortalError("SunFire connection was removed; collection stopped.");
  const collection = { version: 1, source: "SunFire Enrollments", complete: true, agencyId: connection.agency_id, userId: connection.user_id, connectionId: connection.id, start, end, count: records.length, records };
  const bytes = sunfireCollectionBytes(collection), hash = sunfireCollectionHash(collection);
  if (bytes.length > SUNFIRE_MAX_BYTES) throw new SafePortalError("SunFire collection exceeds the private source limit.");
  const path = sunfireStoragePath({ agencyId: connection.agency_id, userId: connection.user_id, connectionId: connection.id }, hash);
  const bucket = db.storage.from("statements");
  const saved = await bucket.upload(path, bytes, { contentType: "application/json", upsert: false });
  if (saved.error && String(saved.error.statusCode) !== "409" && saved.error.message !== "The resource already exists") throw new SafePortalError("Could not preserve the SunFire collection.");
  const check = await bucket.download(path);
  if (check.error || !check.data || check.data.size !== bytes.length || !Buffer.from(await check.data.arrayBuffer()).equals(bytes)) throw new SafePortalError("SunFire saved-source verification failed.");
  return { count: records.length, duplicate: Boolean(saved.error) };
}
export async function syncSunfireConnection(db: Db, connection: ConnectionRow) {
  await requireActiveOwner(db, connection);
  const ciphertext = await loadCiphertext(db, connection.id);
  if (!ciphertext) throw new SafePortalError("Save your SunFire login before syncing.");
  const login = decryptCarrierLogin(ciphertext, connection.id);
  const credentialFingerprint = sha256(ciphertext);
  const portal = sunfirePortalUrl(login.portalUrl ?? ""), start = sunfireDate(login.enrollmentStart), end = localDate();
  if (start > end) throw new SafePortalError("The enrollment start date must be today or earlier.");
  let session = sessions.get(connection.id);
  if (session && (session.portal !== portal || session.credentialFingerprint !== credentialFingerprint)) { await session.browser.close(); sessions.delete(connection.id); session = undefined; }
  if (!session || !session.browser.isConnected() || session.page.isClosed()) {
    const browser = await chromium.launch({ headless: false });
    const context = await browser.newContext({ viewport: { width: 1500, height: 900 }, acceptDownloads: false });
    session = { browser, page: await context.newPage(), portal, credentialFingerprint }; sessions.set(connection.id, session);
  }
  const { page } = session;
  try {
    await page.goto(portal);
    await markConnection(db, connection.id, { ok: false, error: "Sync running. Signing in to SunFire with your saved login." });
    await automaticCarrierLogin(page, "SunFire", login,
      async () => await page.locator("#navLinkreporting").count() === 1,
      () => markConnection(db, connection.id, { ok: false, error: "SunFire needs verification or sign-in review. Complete it in the worker window; enrollment collection will continue." }));
    await markConnection(db, connection.id, { ok: false, error: "Sync running. Reading and verifying SunFire enrollments." });
    const { collectEnrollments } = await import(new URL(`./sunfire/collector.ts?attempt=${Date.now()}`, import.meta.url).href) as typeof import("./sunfire/collector.js");
    let result: { count: number; duplicate: boolean } | undefined;
    await collectEnrollments(page.context(), page, { portal, start, end,
      log: () => undefined,
      checkpoint: async (records, complete) => { if (complete) result = await storeSunfireCollection(db, connection, start, end, records); } });
    if (!result) throw new SafePortalError("SunFire collection did not finish.");
    return result;
  } catch {
    throw new SafePortalError("SunFire collection paused. The signed-in worker window stays open; choose Sync enrollments again to retry. No partial collection or commission records were imported.");
  }
}
