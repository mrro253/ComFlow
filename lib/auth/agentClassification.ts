import { AGENT_TYPES, CAREER_LEVELS, type AgentType, type CareerLevel, type Role } from "@/types/domain";

export type AgentClassification =
  | { ok: true; agentType: AgentType | null; careerLevel: CareerLevel | null }
  | { ok: false; error: string };

/**
 * Validates the agent type / career level chosen in the team forms. Mirrors the
 * database check (`career_level` is set exactly when `agent_type` is 'career').
 *  - Agents must be Career (with a level) or Independent.
 *  - Managers may be left untyped.
 */
export function parseAgentClassification(
  role: Exclude<Role, "owner">,
  rawType: string,
  rawLevel: string
): AgentClassification {
  if (rawType === "") {
    if (role === "agent") return { ok: false, error: "Choose whether this agent is Career or Independent." };
    return { ok: true, agentType: null, careerLevel: null };
  }
  if (!(AGENT_TYPES as string[]).includes(rawType)) {
    return { ok: false, error: "Choose a valid agent type." };
  }
  if (rawType === "independent") return { ok: true, agentType: "independent", careerLevel: null };

  if (!(CAREER_LEVELS as readonly string[]).includes(rawLevel)) {
    return { ok: false, error: "Choose a career level for Career agents." };
  }
  return { ok: true, agentType: "career", careerLevel: rawLevel as CareerLevel };
}
