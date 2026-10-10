import type { AppUser } from "@/types/domain";

/**
 * Who can open Statements, upload a PDF, and approve an import.
 * The agency Owner always can. An Independent with an owner-level profile
 * can, but only for statements attributed to themselves.
 */
export function canManageStatements(
  user: Pick<AppUser, "role" | "agentType" | "independentOwner">
): boolean {
  return user.role === "owner" || (user.agentType === "independent" && user.independentOwner);
}

/** Owner: any statement in the agency. Independent owner-profile: only their own. */
export function canAccessStatement(
  user: Pick<AppUser, "id" | "role" | "agentType" | "independentOwner">,
  statement: { userId: string | null }
): boolean {
  if (user.role === "owner") return true;
  return canManageStatements(user) && statement.userId === user.id;
}
