import { describe, expect, it } from "vitest";
import { canAccessStatement, canManageStatements } from "@/lib/auth/statementAccess";

const owner = { id: "o", role: "owner" as const, agentType: "independent" as const, independentOwner: false };
const indieOwner = { id: "i", role: "agent" as const, agentType: "independent" as const, independentOwner: true };
const indie = { id: "i2", role: "agent" as const, agentType: "independent" as const, independentOwner: false };
const career = { id: "c", role: "agent" as const, agentType: "career" as const, independentOwner: false };

describe("canManageStatements", () => {
  it("allows the agency Owner and Independents with an owner-level profile", () => {
    expect(canManageStatements(owner)).toBe(true);
    expect(canManageStatements(indieOwner)).toBe(true);
  });

  it("denies regular Independents, Career agents and captives", () => {
    expect(canManageStatements(indie)).toBe(false);
    expect(canManageStatements(career)).toBe(false);
    expect(canManageStatements({ role: "agent", agentType: "captive", independentOwner: false })).toBe(
      false
    );
  });
});

describe("canAccessStatement", () => {
  it("lets the agency Owner see any statement", () => {
    expect(canAccessStatement(owner, { userId: null })).toBe(true);
    expect(canAccessStatement(owner, { userId: "someone" })).toBe(true);
  });

  it("lets an Independent owner-profile see only their own statements", () => {
    expect(canAccessStatement(indieOwner, { userId: "i" })).toBe(true);
    expect(canAccessStatement(indieOwner, { userId: null })).toBe(false);
    expect(canAccessStatement(indieOwner, { userId: "other" })).toBe(false);
    expect(canAccessStatement(indie, { userId: "i2" })).toBe(false);
  });
});
