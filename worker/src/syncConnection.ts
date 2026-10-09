import { decryptCarrierLogin } from "../../lib/crypto/credentials";
import { getPortal } from "./carriers/registry.js";
import {
  knownStatementIds,
  loadCiphertext,
  loadStatementOwner,
  markConnection,
  storeStatement,
  type ConnectionRow,
  type Db,
} from "./db.js";
import { safeError, yearsToSync } from "./safeError.js";
import { statementOwnerUserId } from "./statementOwner.js";

/** Runs one claimed connection end to end. Never throws: failures are recorded on the connection. */
export async function syncConnection(db: Db, connection: ConnectionRow): Promise<void> {
  const log = (message: string) => console.log(`[${connection.id.slice(0, 8)}] ${message}`);

  try {
    const portal = getPortal(connection.carrier);
    if (!portal) throw new Error(`${connection.carrier} is not supported by the worker yet`);

    const ciphertext = await loadCiphertext(db, connection.id);
    if (!ciphertext) throw new Error("No saved login. Enter your carrier login again.");
    // Decryption failures (wrong key, tampering) surface as a generic message below.
    const login = decryptCarrierLogin(ciphertext, connection.id);

    const owner = await loadStatementOwner(db, connection.user_id);
    if (!owner) throw new Error("The connection's user no longer exists");
    const statementOwner = statementOwnerUserId(owner);

    const known = await knownStatementIds(db, connection.id);
    const summary = await portal.pull(login, {
      years: yearsToSync(),
      isKnown: (id) => known.has(id),
      log,
      onStatement: async (statement) => {
        const outcome = await storeStatement(db, {
          agencyId: connection.agency_id,
          connectionId: connection.id,
          carrier: connection.carrier,
          statementOwnerUserId: statementOwner,
          carrierStatementId: statement.carrierStatementId,
          filename: statement.filename,
          pdf: statement.pdf,
        });
        log(`statement ${outcome}`);
      },
    });

    log(`done: ${JSON.stringify(summary)}`);
    await markConnection(
      db,
      connection.id,
      summary.failed > 0
        ? { ok: true, warning: `${summary.failed} statement(s) could not be downloaded. Try Sync now again.` }
        : { ok: true }
    );
  } catch (error) {
    const message = /decrypt|CREDENTIAL_ENCRYPTION_KEY/i.test(error instanceof Error ? error.message : "")
      ? "The saved login could not be read. Enter your carrier login again."
      : safeError(error);
    log(`failed: ${message}`);
    await markConnection(db, connection.id, { ok: false, error: message });
  }
}
