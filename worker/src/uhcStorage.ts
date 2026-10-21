import { type ConnectionRow, type Db, storeStatement } from "./db.js";
import { sha256Hex } from "./safeError.js";
import { assertUhcFile, uhcDownloadName } from "./carriers/uhcMetadata.js";
import { SafePortalError } from "./carriers/types.js";
import type { UhcSourcePair } from "./carriers/uhc.js";

/** Preserve the companion text privately before registering the PDF for ordinary review. */
export async function storeUhcPair(db: Db, connection: ConnectionRow, owner: string | null, pair: UhcSourcePair): Promise<"stored" | "duplicate"> {
  assertUhcFile(pair.pdf, "pdf"); assertUhcFile(pair.text, "txt");
  const identity = uhcDownloadName(pair.filename, pair.statementMonth, "pdf");
  if (sha256Hex(Buffer.from(identity.partyId)) !== pair.payeeHash) throw new SafePortalError("UnitedHealthcare source payee does not match");
  const current = await db.from("carrier_connections").select("status").eq("agency_id", connection.agency_id).eq("id", connection.id).eq("user_id", connection.user_id).maybeSingle();
  if (current.error || !current.data || current.data.status === "disabled") throw new SafePortalError("UnitedHealthcare connection was removed; sync stopped");
  const pdfHash = sha256Hex(pair.pdf), textHash = sha256Hex(pair.text);
  const pairHash = sha256Hex(Buffer.from(JSON.stringify(["uhc-source-pair-v1", pdfHash, textHash])));
  const bucket = db.storage.from("statements"), base = `${connection.agency_id}/uhc-downloads/${connection.id}/${pairHash}`;
  for (const source of [{ extension: "pdf", bytes: pair.pdf, mime: "application/pdf" }, { extension: "txt", bytes: pair.text, mime: "text/plain" }]) {
    const result = await bucket.upload(`${base}.${source.extension}`, source.bytes, { contentType: source.mime, upsert: false });
    if (result.error && !["400", "409"].includes(String(result.error.statusCode))) throw new SafePortalError("Could not preserve UnitedHealthcare sources");
    const saved = await bucket.download(`${base}.${source.extension}`);
    if (saved.error || !saved.data || sha256Hex(Buffer.from(await saved.data.arrayBuffer())) !== sha256Hex(source.bytes)) throw new SafePortalError("UnitedHealthcare source integrity check failed");
  }
  const manifest = Buffer.from(JSON.stringify({ pdfHash, textHash, statementMonth: pair.statementMonth, payeeHash: pair.payeeHash }));
  const result = await bucket.upload(`${base}.json`, manifest, { contentType: "application/json", upsert: false });
  if (result.error && !["400", "409"].includes(String(result.error.statusCode))) throw new SafePortalError("Could not preserve UnitedHealthcare source metadata");
  return storeStatement(db, { agencyId: connection.agency_id, connectionId: connection.id, carrier: "UnitedHealthcare", statementOwnerUserId: owner,
    carrierStatementId: `${pair.payeeHash}:${pair.statementMonth}:${pdfHash}`, filename: pair.filename, pdf: pair.pdf });
}
