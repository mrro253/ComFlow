import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decryptCarrierLogin, encryptCarrierLogin } from "@/lib/crypto/credentials";

const KEY = randomBytes(32).toString("base64");
const LOGIN = { username: "synthetic-user", password: "synthetic-pass-123!" };

describe("carrier credential encryption", () => {
  it("round-trips a login", () => {
    const payload = encryptCarrierLogin(LOGIN, "conn-1", KEY);
    expect(decryptCarrierLogin(payload, "conn-1", KEY)).toEqual(LOGIN);
  });

  it("never leaves the password or username readable in the payload", () => {
    const payload = encryptCarrierLogin(LOGIN, "conn-1", KEY);
    expect(payload).not.toContain(LOGIN.password);
    expect(payload).not.toContain(LOGIN.username);
    expect(payload.startsWith("v1.")).toBe(true);
  });

  it("uses a fresh IV each time", () => {
    expect(encryptCarrierLogin(LOGIN, "conn-1", KEY)).not.toBe(
      encryptCarrierLogin(LOGIN, "conn-1", KEY)
    );
  });

  it("refuses to decrypt on a different connection, key, or tampered payload", () => {
    const payload = encryptCarrierLogin(LOGIN, "conn-1", KEY);
    expect(() => decryptCarrierLogin(payload, "conn-2", KEY)).toThrow(/could not be decrypted/);
    expect(() =>
      decryptCarrierLogin(payload, "conn-1", randomBytes(32).toString("base64"))
    ).toThrow(/could not be decrypted/);
    const tampered = `${payload.slice(0, -2)}AA`;
    expect(() => decryptCarrierLogin(tampered, "conn-1", KEY)).toThrow(/could not be decrypted/);
  });

  it("requires a valid key and non-empty login", () => {
    expect(() => encryptCarrierLogin(LOGIN, "conn-1", undefined)).toThrow(/not configured/);
    expect(() => encryptCarrierLogin(LOGIN, "conn-1", "c2hvcnQ=")).toThrow(/32 bytes/);
    expect(() => encryptCarrierLogin({ username: "", password: "x" }, "conn-1", KEY)).toThrow();
  });

  it("rejects unknown formats", () => {
    expect(() => decryptCarrierLogin("v9.a.b.c", "conn-1", KEY)).toThrow(/Unsupported/);
  });
});
