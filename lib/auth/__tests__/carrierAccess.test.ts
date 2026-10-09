import { describe, expect, it } from "vitest";
import { canManageCarrierLogin } from "@/lib/auth/carrierAccess";

describe("canManageCarrierLogin", () => {
  it("allows the owner and independent agents", () => {
    expect(canManageCarrierLogin({ role: "owner", agentType: null })).toBe(true);
    expect(canManageCarrierLogin({ role: "owner", agentType: "independent" })).toBe(true);
    expect(canManageCarrierLogin({ role: "agent", agentType: "independent" })).toBe(true);
  });

  it("denies career agents, untyped agents and managers", () => {
    expect(canManageCarrierLogin({ role: "agent", agentType: "career" })).toBe(false);
    expect(canManageCarrierLogin({ role: "agent", agentType: null })).toBe(false);
    expect(canManageCarrierLogin({ role: "manager", agentType: "independent" })).toBe(false);
  });
});
