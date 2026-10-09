import { describe, expect, it } from "vitest";
import { parseAgentClassification } from "@/lib/auth/agentClassification";

describe("parseAgentClassification", () => {
  it("requires a type for agents but not for managers", () => {
    expect(parseAgentClassification("agent", "", "")).toMatchObject({ ok: false });
    expect(parseAgentClassification("manager", "", "")).toEqual({ ok: true, agentType: null, careerLevel: null });
  });

  it("requires a valid level for Career agents", () => {
    expect(parseAgentClassification("agent", "career", "")).toMatchObject({ ok: false });
    expect(parseAgentClassification("agent", "career", "Chief Wizard")).toMatchObject({ ok: false });
    expect(parseAgentClassification("agent", "career", "Client Advisor")).toEqual({
      ok: true,
      agentType: "career",
      careerLevel: "Client Advisor",
    });
  });

  it("drops any level for Independent agents, matching the database check", () => {
    expect(parseAgentClassification("agent", "independent", "Client Advisor")).toEqual({
      ok: true,
      agentType: "independent",
      careerLevel: null,
    });
  });

  it("rejects unknown types", () => {
    expect(parseAgentClassification("agent", "freelance", "")).toMatchObject({ ok: false });
  });
});
