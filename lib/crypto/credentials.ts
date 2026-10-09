import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Encryption for carrier portal logins (AES-256-GCM).
 *
 * - Key: `CREDENTIAL_ENCRYPTION_KEY`, 32 random bytes, base64 encoded.
 *   Generate with `openssl rand -base64 32`. Server-only; never expose to the
 *   browser, never commit it. Losing the key means every stored login must be
 *   re-entered; rotating it requires re-encrypting stored rows.
 * - Each payload is bound to its connection id (GCM additional authenticated
 *   data), so a ciphertext copied onto another connection will not decrypt.
 * - Format: `v1.<iv>.<authTag>.<ciphertext>`, each part base64url.
 *
 * This file intentionally has no imports from the rest of the app so the
 * carrier worker can import it by relative path.
 * TODO: move to Supabase Vault once enabled for the project.
 */

export interface CarrierLogin {
  username: string;
  password: string;
}

const VERSION = "v1";
const KEY_BYTES = 32;
const IV_BYTES = 12;

function loadKey(rawKey: string | undefined): Buffer {
  if (!rawKey) throw new Error("CREDENTIAL_ENCRYPTION_KEY is not configured");
  const key = Buffer.from(rawKey, "base64");
  if (key.length !== KEY_BYTES) {
    throw new Error("CREDENTIAL_ENCRYPTION_KEY must be 32 bytes, base64 encoded");
  }
  return key;
}

export function encryptCarrierLogin(
  login: CarrierLogin,
  connectionId: string,
  rawKey: string | undefined = process.env.CREDENTIAL_ENCRYPTION_KEY
): string {
  if (!login.username || !login.password) {
    throw new Error("Username and password are required");
  }
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", loadKey(rawKey), iv);
  cipher.setAAD(Buffer.from(connectionId));
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(login), "utf8"),
    cipher.final(),
  ]);
  return [VERSION, iv, cipher.getAuthTag(), ciphertext]
    .map((part) => (typeof part === "string" ? part : part.toString("base64url")))
    .join(".");
}

export function decryptCarrierLogin(
  payload: string,
  connectionId: string,
  rawKey: string | undefined = process.env.CREDENTIAL_ENCRYPTION_KEY
): CarrierLogin {
  const [version, iv, tag, ciphertext] = payload.split(".");
  if (version !== VERSION || !iv || !tag || !ciphertext) {
    throw new Error("Unsupported credential format");
  }
  try {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      loadKey(rawKey),
      Buffer.from(iv, "base64url")
    );
    decipher.setAAD(Buffer.from(connectionId));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    const plain = Buffer.concat([
      decipher.update(Buffer.from(ciphertext, "base64url")),
      decipher.final(),
    ]).toString("utf8");
    const parsed = JSON.parse(plain) as Partial<CarrierLogin>;
    if (!parsed.username || !parsed.password) throw new Error("malformed");
    return { username: parsed.username, password: parsed.password };
  } catch {
    // Deliberately vague: never reveal why decryption failed.
    throw new Error("Stored credentials could not be decrypted");
  }
}
