import { expect, it } from "vitest";
import { parseVerification, signVerification, verificationAuthenticator } from "../verificationProtocol";
const key = Buffer.alloc(32, 7).toString("base64");
it("authenticates the exact body once and rejects replay, edits and expiry", () => {
  const authenticate = verificationAuthenticator(key), body = '{"action":"state"}', now = 1794000000000;
  const signed = signVerification(body, key, now);
  expect(authenticate(body + " ", signed.stamp, signed.nonce, signed.signature, now)).toBe(false);
  expect(authenticate(body, signed.stamp, signed.nonce, signed.signature, now)).toBe(true);
  expect(authenticate(body, signed.stamp, signed.nonce, signed.signature, now)).toBe(false);
  const expired = signVerification(body, key, now);
  expect(authenticate(body, expired.stamp, expired.nonce, expired.signature, now + 21000)).toBe(false);
});
it("rejects missing keys and arbitrary browser actions", () => {
  expect(() => verificationAuthenticator("short")).toThrow();
  const id = "11111111-1111-4111-8111-111111111111";
  const input = { connectionId: id, agencyId: id, userId: id, sessionId: id };
  expect(() => parseVerification({ ...input, action: "navigate", url: "https://example.com" })).toThrow();
  expect(() => parseVerification({ ...input, action: "code", code: "<script>" })).toThrow();
  expect(parseVerification({ ...input, action: "code", code: "123456", url: "ignored" })).not.toHaveProperty("url");
});
