import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
export interface GhlBinding { id: string; agencyId: string; userId: string; locationId: string }
function key() {
  const bytes=Buffer.from(process.env.CREDENTIAL_ENCRYPTION_KEY ?? "","base64");
  if(bytes.length!==32) throw new Error("Secure connection storage is unavailable.");
  return bytes;
}
const aad=(b:GhlBinding)=>Buffer.from(JSON.stringify(["ghl-token-v1",b.id,b.agencyId,b.userId,b.locationId]));
export function encryptGhlToken(token:string,binding:GhlBinding) {
  const iv=randomBytes(12), cipher=createCipheriv("aes-256-gcm",key(),iv); cipher.setAAD(aad(binding));
  const encrypted=Buffer.concat([cipher.update(token,"utf8"),cipher.final()]);
  return ["v1",iv.toString("base64url"),cipher.getAuthTag().toString("base64url"),encrypted.toString("base64url")].join(".");
}
export function decryptGhlToken(value:string,binding:GhlBinding) {
  try {
    const [version,iv,tag,encrypted,...extra]=value.split(".");
    if(version!=="v1" || !iv || !tag || !encrypted || extra.length) throw new Error();
    const cipher=createDecipheriv("aes-256-gcm",key(),Buffer.from(iv,"base64url")); cipher.setAAD(aad(binding));cipher.setAuthTag(Buffer.from(tag,"base64url"));
    return Buffer.concat([cipher.update(Buffer.from(encrypted,"base64url")),cipher.final()]).toString("utf8");
  } catch { throw new Error("Stored GHL access could not be read. Replace the token."); }
}
