import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

export type VerificationAction = "state" | "sms" | "call" | "resend" | "code";
export interface VerificationRequest {
  connectionId: string; agencyId: string; userId: string;
  action: VerificationAction; sessionId?: string; code?: string;
}
export interface VerificationState {
  status: "waiting" | "ready" | "unavailable";
  sessionId?: string; choices?: ("sms" | "call" | "resend")[]; acceptsCode?: boolean;
}
export function relayKey(value: string | undefined): string {
  if (!value || !/^[A-Za-z0-9+/]{43}=$/.test(value)) throw new Error("Verification relay key is not configured");
  return value;
}
export function signVerification(body: string, key: string, now = Date.now()) {
  const stamp = String(now), nonce = randomUUID();
  return { stamp, nonce, signature: createHmac("sha256", relayKey(key)).update(`${stamp}\n${nonce}\n${body}`).digest("hex") };
}
export function verificationAuthenticator(key: string) {
  relayKey(key);
  const used = new Map<string, number>();
  return (body: string, stamp: string, nonce: string, signature: string, now = Date.now()): boolean => {
    for (const [id, expiry] of used) if (expiry < now) used.delete(id);
    if (!/^\d{13}$/.test(stamp) || Math.abs(now - Number(stamp)) > 20_000 || !/^[\da-f-]{36}$/.test(nonce) || !/^[\da-f]{64}$/.test(signature) || used.has(nonce) || used.size > 5000) return false;
    const expected = createHmac("sha256", key).update(`${stamp}\n${nonce}\n${body}`).digest();
    if (!timingSafeEqual(expected, Buffer.from(signature, "hex"))) return false;
    used.set(nonce, now + 40_000); return true;
  };
}
export function parseVerification(value: unknown): VerificationRequest {
  if (!value || typeof value !== "object") throw new Error("Invalid verification request");
  const v = value as Record<string, unknown>;
  for (const field of ["connectionId", "agencyId", "userId"]) if (typeof v[field] !== "string" || !/^[\da-f-]{36}$/i.test(v[field] as string)) throw new Error("Invalid verification identity");
  if (!["state", "sms", "call", "resend", "code"].includes(String(v.action))) throw new Error("Invalid verification action");
  if (v.action !== "state" && (typeof v.sessionId !== "string" || !/^[\da-f-]{36}$/i.test(v.sessionId))) throw new Error("Invalid verification session");
  if (v.action === "code" && (typeof v.code !== "string" || !/^[A-Za-z0-9]{4,10}$/.test(v.code))) throw new Error("Invalid verification code");
  return { connectionId: v.connectionId as string, agencyId: v.agencyId as string, userId: v.userId as string, action: v.action as VerificationAction, sessionId: v.sessionId as string | undefined, code: v.action === "code" ? v.code as string : undefined };
}
