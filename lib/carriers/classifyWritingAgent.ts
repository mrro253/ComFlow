import { normalizePayeeId } from "@/lib/carriers/payeeId";
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
  /** The person's carrier agent number, used only to tell apart people who share a name. */
  payeeId?: string | null;
  /**
   * Set when `userId` is a principal credited with a captive agent's production:
   * the captive agent who actually wrote the business.
   */
  writingUserId?: string | null;
}

/** Why a row was not assigned automatically. */
export type ReviewCode = "unverified" | "no-match" | "ambiguous";

export type WritingAgentClassification =
  | ({ status: "assigned"; reason: string } & WritingAgentOwner)
  | { status: "review"; reason: string; code: ReviewCode };

/** Normalized statement name -> everyone who could be that name. */
export type WritingAgentIndex = ReadonlyMap<string, readonly WritingAgentOwner[]>;

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
  /** The writer's carrier agent number as printed, when the layout has one. */
  writingAgentId?: string | null;
}

/**
 * Assigns a transaction to a user only when the statement itself proves who
 * wrote the business. A payee name alone never establishes ownership, and an
 * unrecognized or unverified name stays unassigned for human review.
 *
 * If several people share a name, the writer's carrier agent number decides;
 * without a match on it the row stays unassigned. Never guess.
 */
export function classifyWritingAgent(
  row: ClassifiableRow,
  index: WritingAgentIndex
): WritingAgentClassification {
  if (!row.writingAgentVerified || typeof row.writingAgent !== "string") {
    return { status: "review", reason: "Writing agent could not be verified", code: "unverified" };
  }

  const candidates = index.get(normalizeWritingAgentName(row.writingAgent)) ?? [];
  if (candidates.length === 0) {
    return {
      status: "review",
      reason: "Writing agent does not match any configured agent",
      code: "no-match",
    };
  }
  if (candidates.length === 1) {
    return {
      status: "assigned",
      reason: "Verified writing agent matches a configured agent",
      ...candidates[0],
    };
  }

  const printedId = normalizePayeeId(row.writingAgentId);
  const byId = printedId ? candidates.filter((c) => normalizePayeeId(c.payeeId) === printedId) : [];
  if (byId.length === 1) {
    return {
      status: "assigned",
      reason: "Several people share this name; matched on the carrier agent ID",
      ...byId[0],
    };
  }
  return {
    status: "review",
    reason: "Several people share this name; add each person's carrier agent ID so rows match",
    code: "ambiguous",
  };
}
