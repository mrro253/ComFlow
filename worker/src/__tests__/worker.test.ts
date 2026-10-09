import { describe, expect, it } from "vitest";
import { safeError, sha256Hex, statementIdentifier, yearsToSync } from "../safeError";
import { statementOwnerUserId } from "../statementOwner";

describe("safeError", () => {
  it("hides URLs, call logs and locators", () => {
    expect(safeError(new Error("GET https://x.example/sign?token=abc failed"))).toBe(
      "Portal operation failed; check the login and statement availability"
    );
    expect(safeError(new Error("locator.click: Timeout\nCall log:\n - waiting"))).toMatch(/^Portal operation failed/);
  });

  it("keeps ordinary messages short", () => {
    expect(safeError(new Error("Login did not complete"))).toBe("Login did not complete");
    expect(safeError(new Error("x".repeat(500))).length).toBe(300);
  });
});

describe("statementIdentifier", () => {
  it("matches the prototype's formula and ignores surrounding whitespace", () => {
    const a = statementIdentifier({ payeeId: " 123 ", period: "2026-09", filename: "stmt.pdf " });
    const b = statementIdentifier({ payeeId: "123", period: "2026-09", filename: "stmt.pdf" });
    expect(a).toBe(b);
    expect(a).toBe(sha256Hex(Buffer.from("123|2026-09|stmt.pdf")));
  });
});

describe("yearsToSync", () => {
  it("includes last year early in the year", () => {
    expect(yearsToSync(new Date(2027, 0, 15))).toEqual([2027, 2026]);
    expect(yearsToSync(new Date(2027, 1, 15))).toEqual([2027, 2026]);
    expect(yearsToSync(new Date(2027, 5, 15))).toEqual([2027]);
  });
});

describe("statementOwnerUserId", () => {
  it("attributes only independent agents' own statements to them", () => {
    expect(statementOwnerUserId({ id: "u", role: "agent", agent_type: "independent" })).toBe("u");
    expect(statementOwnerUserId({ id: "o", role: "owner", agent_type: "independent" })).toBeNull();
    expect(statementOwnerUserId({ id: "c", role: "agent", agent_type: "career" })).toBeNull();
  });
});
