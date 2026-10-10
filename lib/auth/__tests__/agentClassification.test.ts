import { describe, expect, it } from "vitest";
import {
  checkPrincipal,
  classifyForSave,
  hasCaptiveAgents,
  parseAgentClassification,
} from "@/lib/auth/agentClassification";

const AGENCY = "agency-1";
const person = (id: string, overrides: Record<string, unknown> = {}) => ({
  id,
  agencyId: AGENCY,
  agentType: "career" as const,
  active: true,
  principalId: null,
  ...overrides,
});

describe("parseAgentClassification", () => {
  it("requires a type for agents but not for managers", () => {
    expect(parseAgentClassification("agent", "", "")).toMatchObject({ ok: false });
    expect(parseAgentClassification("manager", "", "")).toEqual({
      ok: true,
      agentType: null,
      careerLevel: null,
      principalId: null,
    });
  });

  it("requires a valid level for Career agents", () => {
    const levels = ["Client Advisor"];
    expect(parseAgentClassification("agent", "career", "", "", [])).toMatchObject({ ok: false });
    expect(parseAgentClassification("agent", "career", "Chief Wizard", "", levels)).toMatchObject({
      ok: false,
    });
    expect(parseAgentClassification("agent", "career", "Client Advisor", "", levels)).toEqual({
      ok: true,
      agentType: "career",
      careerLevel: "Client Advisor",
      principalId: null,
    });
  });

  it("drops any level for Independent agents, matching the database check", () => {
    expect(parseAgentClassification("agent", "independent", "Client Advisor")).toEqual({
      ok: true,
      agentType: "independent",
      careerLevel: null,
      principalId: null,
    });
  });

  it("requires a principal for captive agents and ignores any level", () => {
    expect(parseAgentClassification("agent", "captive", "Client Advisor")).toMatchObject({ ok: false });
    expect(parseAgentClassification("agent", "captive", "Client Advisor", "boss")).toEqual({
      ok: true,
      agentType: "captive",
      careerLevel: null,
      principalId: "boss",
    });
  });

  it("does not allow a captive manager, and drops the principal for other types", () => {
    expect(parseAgentClassification("manager", "captive", "", "boss")).toMatchObject({ ok: false });
    expect(parseAgentClassification("agent", "independent", "", "boss")).toMatchObject({ principalId: null });
  });

  it("rejects unknown types", () => {
    expect(parseAgentClassification("agent", "freelance", "")).toMatchObject({ ok: false });
  });
});

describe("checkPrincipal", () => {
  const team = [person("boss"), person("cap", { agentType: "captive", principalId: "boss" }), person("gone", { active: false })];

  it("accepts an active, non-captive teammate in the same agency", () => {
    expect(checkPrincipal("boss", "new", AGENCY, team)).toBeNull();
  });

  it("rejects self, unknown, other-agency, inactive, and captive principals", () => {
    expect(checkPrincipal("boss", "boss", AGENCY, team)).toMatch(/own principal/);
    expect(checkPrincipal("nobody", null, AGENCY, team)).toMatch(/not found/);
    expect(checkPrincipal("boss", null, "other-agency", team)).toMatch(/not found/);
    expect(checkPrincipal("gone", null, AGENCY, team)).toMatch(/inactive/);
    expect(checkPrincipal("cap", null, AGENCY, team)).toMatch(/cannot be a principal/);
  });
});

describe("classifyForSave", () => {
  const team = [person("boss"), person("cap", { agentType: "captive", principalId: "boss" })];
  const base = {
    role: "agent" as const,
    rawLevel: "",
    validLevels: [] as string[],
    agencyId: AGENCY,
    team,
  };

  it("passes non-captive types straight through", () => {
    expect(classifyForSave({ ...base, rawType: "independent", rawPrincipalId: "", agentId: null })).toMatchObject({
      ok: true,
      agentType: "independent",
    });
  });

  it("accepts a valid principal and rejects an invalid one", () => {
    expect(classifyForSave({ ...base, rawType: "captive", rawPrincipalId: "boss", agentId: "x" })).toMatchObject({
      ok: true,
      principalId: "boss",
    });
    expect(classifyForSave({ ...base, rawType: "captive", rawPrincipalId: "cap", agentId: "x" })).toMatchObject({
      ok: false,
    });
  });

  it("will not turn a principal into a captive agent", () => {
    expect(hasCaptiveAgents("boss", team)).toBe(true);
    expect(classifyForSave({ ...base, rawType: "captive", rawPrincipalId: "other", agentId: "boss", team: [...team, person("other")] })).toMatchObject({
      ok: false,
    });
  });
});
