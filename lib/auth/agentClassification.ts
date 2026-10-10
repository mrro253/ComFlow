import { AGENT_TYPES, CAREER_LEVELS, type AgentType, type AppUser, type CareerLevel, type Role } from "@/types/domain";

export type AgentClassification =
  | {
      ok: true;
      agentType: AgentType | null;
      careerLevel: CareerLevel | null;
      /** Set only for captive agents. */
      principalId: string | null;
    }
  | { ok: false; error: string };

/**
 * Validates the agent type / career level / principal chosen in the team forms.
 * Mirrors the database checks (`career_level` is set exactly when `agent_type`
 * is 'career'; `principal_id` exactly when it is 'captive').
 *  - Agents must be Career (with a level), Independent, or Captive (with a principal).
 *  - Managers may be left untyped, but cannot be Captive.
 */
export function parseAgentClassification(
  role: Exclude<Role, "owner">,
  rawType: string,
  rawLevel: string,
  rawPrincipalId = ""
): AgentClassification {
  if (rawType === "") {
    if (role === "agent") {
      return { ok: false, error: "Choose whether this agent is Career, Independent or Captive." };
    }
    return { ok: true, agentType: null, careerLevel: null, principalId: null };
  }
  if (!(AGENT_TYPES as string[]).includes(rawType)) {
    return { ok: false, error: "Choose a valid agent type." };
  }
  if (rawType === "independent") {
    return { ok: true, agentType: "independent", careerLevel: null, principalId: null };
  }
  if (rawType === "captive") {
    if (role !== "agent") return { ok: false, error: "Only agents can be captive, not managers." };
    if (!rawPrincipalId) return { ok: false, error: "Choose the principal agent for a captive agent." };
    return { ok: true, agentType: "captive", careerLevel: null, principalId: rawPrincipalId };
  }

  if (!(CAREER_LEVELS as readonly string[]).includes(rawLevel)) {
    return { ok: false, error: "Choose a career level for Career agents." };
  }
  return { ok: true, agentType: "career", careerLevel: rawLevel as CareerLevel, principalId: null };
}

/**
 * A captive agent's principal must be an active teammate in the same agency who
 * is not captive too (no chains) and is not the captive agent themselves.
 * Returns an error message, or null when the choice is valid.
 */
export function checkPrincipal(
  principalId: string,
  agentId: string | null,
  agencyId: string,
  team: readonly Pick<AppUser, "id" | "agencyId" | "agentType" | "active">[]
): string | null {
  if (principalId === agentId) return "An agent cannot be their own principal.";
  const principal = team.find((u) => u.id === principalId);
  if (!principal || principal.agencyId !== agencyId) return "Principal agent not found.";
  if (!principal.active) return "The principal agent is inactive.";
  if (principal.agentType === "captive") return "A captive agent cannot be a principal.";
  return null;
}

/**
 * Captive agents are credited to their principal, so a teammate who already has
 * captive agents cannot be turned into one.
 */
export function hasCaptiveAgents(
  userId: string,
  team: readonly Pick<AppUser, "principalId">[]
): boolean {
  return team.some((u) => u.principalId === userId);
}

/**
 * Parse + the team-aware checks for captive agents, in one step for the server
 * actions. `agentId` is null when the user is being created.
 */
export function classifyForSave(input: {
  role: Exclude<Role, "owner">;
  rawType: string;
  rawLevel: string;
  rawPrincipalId: string;
  agentId: string | null;
  agencyId: string;
  team: readonly Pick<AppUser, "id" | "agencyId" | "agentType" | "active" | "principalId">[];
}): AgentClassification {
  const parsed = parseAgentClassification(input.role, input.rawType, input.rawLevel, input.rawPrincipalId);
  if (!parsed.ok || parsed.agentType !== "captive" || parsed.principalId === null) return parsed;

  const problem = checkPrincipal(parsed.principalId, input.agentId, input.agencyId, input.team);
  if (problem) return { ok: false, error: problem };
  if (input.agentId && hasCaptiveAgents(input.agentId, input.team)) {
    return { ok: false, error: "This teammate is the principal of captive agents, so they cannot be captive." };
  }
  return parsed;
}
