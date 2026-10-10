import {
  normalizeWritingAgentName,
  writingAgentAliasesFor,
  type WritingAgentOwner,
} from "@/lib/carriers/classifyWritingAgent";
import { normalizePayeeId } from "@/lib/carriers/payeeId";
import type { AgentType, Role } from "@/types/domain";

export interface OwnerCandidate {
  id: string;
  firstName: string;
  lastName: string;
  role: Role;
  agentType: AgentType | null;
  active: boolean;
  /** The person's carrier agent number, when known. */
  payeeId?: string | null;
  /** Captive agents: the principal their production is credited to. */
  principalId?: string | null;
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

function ownerFor(
  user: OwnerCandidate,
  entities: readonly ProductionEntityRef[],
  usersById: ReadonlyMap<string, OwnerCandidate>
): WritingAgentOwner | null {
  if (user.agentType === "captive") {
    // The principal is credited and reported; the captive agent is only recorded as the
    // writer. Without an active principal there is nobody to credit, so stay unmatched.
    const principal = user.principalId ? usersById.get(user.principalId) : undefined;
    if (!principal?.active || principal.agentType === "captive") return null;
    const credited = ownerFor(principal, entities, usersById);
    return credited
      ? { ...credited, payeeId: normalizePayeeId(user.payeeId), writingUserId: user.id }
      : null;
  }
  const entity = productionEntityFor(user, entities);
  return {
    userId: user.id,
    agentType: user.agentType,
    productionEntityId: entity?.id ?? null,
    entityType: entity?.entityType ?? null,
    payeeId: normalizePayeeId(user.payeeId),
    writingUserId: null,
  };
}

/**
 * Statement name (normalized) -> everyone who could be that name, active users
 * only. Two people with the same name both stay in the list: classification then
 * needs the carrier agent ID instead of guessing which one wrote the business.
 */
export function buildWritingAgentOwners(
  users: readonly OwnerCandidate[],
  entities: readonly ProductionEntityRef[]
): Map<string, WritingAgentOwner[]> {
  const index = new Map<string, WritingAgentOwner[]>();
  const usersById = new Map(users.map((u) => [u.id, u]));
  for (const user of users) {
    if (!user.active) continue;
    const owner = ownerFor(user, entities, usersById);
    if (!owner) continue;
    // A Set avoids listing one person twice when both name orders are identical.
    for (const alias of new Set(writingAgentAliasesFor(user.firstName, user.lastName))) {
      const list = index.get(alias);
      if (list) list.push(owner);
      else index.set(alias, [owner]);
    }
  }
  return index;
}

/**
 * Adds explicitly saved aliases (from "remember this name" when the Owner picks
 * a person for a printed name). A saved alias is a deliberate decision, so it
 * replaces any name-derived candidates for that name.
 */
export function withSavedAliases(
  base: ReadonlyMap<string, readonly WritingAgentOwner[]>,
  saved: readonly { alias: string; userId: string }[],
  users: readonly OwnerCandidate[],
  entities: readonly ProductionEntityRef[]
): Map<string, readonly WritingAgentOwner[]> {
  const merged = new Map(base);
  const usersById = new Map(users.map((u) => [u.id, u]));
  for (const { alias, userId } of saved) {
    const user = usersById.get(userId);
    if (!user?.active) continue;
    const owner = ownerFor(user, entities, usersById);
    if (owner) merged.set(normalizeWritingAgentName(alias), [owner]);
  }
  return merged;
}
