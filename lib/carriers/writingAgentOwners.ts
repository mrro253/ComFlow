import {
  normalizeWritingAgentName,
  writingAgentAliasesFor,
  type WritingAgentOwner,
} from "@/lib/carriers/classifyWritingAgent";
import type { AgentType, Role } from "@/types/domain";

export interface OwnerCandidate {
  id: string;
  firstName: string;
  lastName: string;
  role: Role;
  agentType: AgentType | null;
  active: boolean;
}

export interface ProductionEntityRef {
  id: string;
  entityType: "agency" | "personal";
  userId: string | null;
}

/**
 * Where a person's carrier-paid production is reported:
 *  - the Owner's own writing is PERSONAL production (never mixed with agency production)
 *  - Career agents write for the agency
 *  - anyone else (Independent agents, untyped managers) has no entity: they are
 *    tracked by user only.
 * TODO(Ryan): confirm how Independent agents' production should roll up.
 */
export function productionEntityFor(
  user: Pick<OwnerCandidate, "id" | "role" | "agentType">,
  entities: readonly ProductionEntityRef[]
): ProductionEntityRef | null {
  if (user.role === "owner") {
    return entities.find((e) => e.entityType === "personal" && e.userId === user.id) ?? null;
  }
  if (user.agentType === "career") {
    return entities.find((e) => e.entityType === "agency") ?? null;
  }
  return null;
}

/** Statement name (normalized) -> the person it belongs to, for active users only. */
export function buildWritingAgentOwners(
  users: readonly OwnerCandidate[],
  entities: readonly ProductionEntityRef[]
): Map<string, WritingAgentOwner> {
  const owners = new Map<string, WritingAgentOwner>();
  for (const user of users) {
    if (!user.active) continue;
    const entity = productionEntityFor(user, entities);
    const owner: WritingAgentOwner = {
      userId: user.id,
      agentType: user.agentType,
      productionEntityId: entity?.id ?? null,
      entityType: entity?.entityType ?? null,
    };
    for (const alias of writingAgentAliasesFor(user.firstName, user.lastName)) {
      // First user wins on a name collision; the Owner can disambiguate by assigning manually.
      if (!owners.has(alias)) owners.set(alias, owner);
    }
  }
  return owners;
}

/**
 * Adds explicitly saved aliases (from "remember this name" on manual assignment)
 * on top of the name-derived ones. Saved aliases win over derived ones.
 */
export function withSavedAliases(
  base: Map<string, WritingAgentOwner>,
  saved: readonly { alias: string; userId: string }[],
  users: readonly OwnerCandidate[],
  entities: readonly ProductionEntityRef[]
): Map<string, WritingAgentOwner> {
  const merged = new Map(base);
  const usersById = new Map(users.map((u) => [u.id, u]));
  for (const { alias, userId } of saved) {
    const user = usersById.get(userId);
    if (!user?.active) continue;
    const entity = productionEntityFor(user, entities);
    merged.set(normalizeWritingAgentName(alias), {
      userId: user.id,
      agentType: user.agentType,
      productionEntityId: entity?.id ?? null,
      entityType: entity?.entityType ?? null,
    });
  }
  return merged;
}
