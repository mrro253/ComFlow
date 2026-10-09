import type { AgentType } from "@/types/domain";

/**
 * Who a writing-agent name on a carrier statement belongs to, as configured by
 * the agency (see `writing_agent_aliases`). `entityType` is the production
 * category the business lands in: an owner's own writing is "personal" and is
 * never mixed with "agency" production in management reports.
 */
export interface WritingAgentOwner {
  userId: string;
  agentType: AgentType | null;
  productionEntityId: string | null;
  entityType: "agency" | "personal" | null;
}

export type WritingAgentClassification =
  | ({ status: "assigned"; reason: string } & WritingAgentOwner)
  | { status: "review"; reason: string };

/** Upper-case, commas removed, whitespace collapsed. Stored form of an alias. */
export function normalizeWritingAgentName(name: string): string {
  return name.trim().replace(/,/g, " ").replace(/\s+/g, " ").toUpperCase();
}

/**
 * Both orderings carriers print ("RYAN BALL" and "BALL, RYAN") for one person.
 * Matching stays exact: middle initials, suffixes, or typos are not matched.
 */
export function writingAgentAliasesFor(firstName: string, lastName: string): string[] {
  const first = normalizeWritingAgentName(firstName);
  const last = normalizeWritingAgentName(lastName);
  return [`${first} ${last}`, `${last} ${first}`];
}

export interface ClassifiableRow {
  writingAgent: string | null;
  writingAgentVerified: boolean;
}

/**
 * Assigns a transaction to a user only when the statement itself proves who
 * wrote the business. A payee name alone never establishes ownership, and an
 * unrecognized or unverified name stays unassigned for human review.
 */
export function classifyWritingAgent(
  row: ClassifiableRow,
  aliases: ReadonlyMap<string, WritingAgentOwner>
): WritingAgentClassification {
  if (!row.writingAgentVerified || typeof row.writingAgent !== "string") {
    return { status: "review", reason: "Writing agent could not be verified" };
  }
  const owner = aliases.get(normalizeWritingAgentName(row.writingAgent));
  if (!owner) {
    return {
      status: "review",
      reason: "Writing agent does not match any configured agent alias",
    };
  }
  return {
    status: "assigned",
    reason: "Verified writing agent matches a configured alias",
    ...owner,
  };
}
