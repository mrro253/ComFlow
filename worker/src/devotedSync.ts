import { automaticCarrierLogin } from "./carrierLogin.js";
import { decryptCarrierLogin } from "../../lib/crypto/credentials";
import { loadCiphertext } from "./db.js";
import { chromium, type Browser, type Page } from "playwright";
import { syncDevotedPage } from "./carriers/devotedDownload.js";
import { SafePortalError } from "./carriers/types.js";
import { sha256Hex, yearsToSync } from "./safeError.js";
import { type Db, type ConnectionRow, markConnection } from "./db.js";

// Session cookies stay in memory only. Retain the window after recoverable errors.
const sessions = new Map<string, { browser: Browser; page: Page }>();
export async function storeDevotedPair(db: Db, connection: ConnectionRow, payDate: string, pdf: Buffer, workbook: Buffer): Promise<"stored" | "duplicate"> {
  const current = await db.from("carrier_connections").select("status").eq("id", connection.id).eq("agency_id", connection.agency_id).eq("user_id", connection.user_id).maybeSingle();
  if (current.error || !current.data || current.data.status === "disabled") throw new SafePortalError("Devoted connection was removed; sync stopped");
  if (pdf.length > 15728640 || workbook.length > 15728640) throw new SafePortalError("Devoted source exceeds the 15 MB review limit");
  const pdfHash = sha256Hex(pdf), workbookHash = sha256Hex(workbook);
  const pairHash = sha256Hex(Buffer.from(JSON.stringify(["devoted-pair-v1", pdfHash, workbookHash])));
  const prior = await db.from("commission_statements").select("id").eq("agency_id", connection.agency_id).eq("carrier", "Devoted Health").eq("source_pair_hash", pairHash).maybeSingle();
  if (prior.error) throw new SafePortalError("Could not check previously imported Devoted sources");
  if (prior.data) return "duplicate";
  const base = `${connection.agency_id}/devoted-inbox/${connection.id}/${pairHash}`;
  const bucket = db.storage.from("statements");
  for (const source of [{ ext: "pdf", bytes: pdf, mime: "application/pdf" }, { ext: "xlsx", bytes: workbook, mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }]) {
    const upload = await bucket.upload(`${base}.${source.ext}`, source.bytes, { contentType: source.mime, upsert: false });
    if (upload.error && !["409", "400"].includes(String(upload.error.statusCode))) throw new SafePortalError("Could not preserve Devoted source pair");
    const saved = await bucket.download(`${base}.${source.ext}`);
    if (saved.error || !saved.data || sha256Hex(Buffer.from(await saved.data.arrayBuffer())) !== sha256Hex(source.bytes)) throw new SafePortalError("Devoted saved-source integrity check failed");
  }
  // Manifest last: incomplete downloads never appear as reviewable pairs.
  const manifest = Buffer.from(JSON.stringify({ payDate, pdfHash, workbookHash, pairHash }));
  const upload = await bucket.upload(`${base}.json`, manifest, { contentType: "application/json", upsert: false });
  if (upload.error && !["409", "400"].includes(String(upload.error.statusCode))) throw new SafePortalError("Could not register Devoted review pair");
  return upload.error ? "duplicate" : "stored";
}

export async function syncDevotedConnection(db: Db, connection: ConnectionRow) {
  const owner = await db.from("users").select("role,active").eq("id", connection.user_id).eq("agency_id", connection.agency_id).maybeSingle();
  if (owner.error || owner.data?.role !== "owner" || !owner.data.active) throw new SafePortalError("Devoted sync requires an active owner connection");
  let session = sessions.get(connection.id);
  if (!session || !session.browser.isConnected() || session.page.isClosed()) {
    const browser = await chromium.launch({ headless: false });
    const context = await browser.newContext({ acceptDownloads: true });
    session = { browser, page: await context.newPage() };
    sessions.set(connection.id, session);
  }
  const { page } = session;
  await page.goto("https://agent.devoted.com/commissions");
  const ciphertext = await loadCiphertext(db, connection.id);
  if (!ciphertext) throw new SafePortalError("Enter your Devoted login again before syncing");
  const login = decryptCarrierLogin(ciphertext, connection.id);
  await markConnection(db, connection.id, { ok: false, error: "Sync running. Signing in to Devoted with your saved login." });
  try {
    await automaticCarrierLogin(page, "Devoted Health", login,
      () => page.getByRole("heading", { name: "My Commissions", exact: true }).isVisible(),
      () => markConnection(db, connection.id, { ok: false, error: "Devoted needs verification or sign-in review. Complete the request in the worker browser; sync continues when ready." }));
    return await syncDevotedPage(page, yearsToSync(), (date, pdf, workbook) => storeDevotedPair(db, connection, date, pdf, workbook));
  } catch {
    throw new SafePortalError("Devoted sync paused. Its browser stays open; complete sign-in, then choose Sync now again. No commission records were imported.");
  }
}
