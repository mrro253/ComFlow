import type { AppUser } from "@/types/domain";

/**
 * Who enters a carrier portal login: the Owner (the agency's own login) and
 * Independent agents (their own). Career agents are paid by the agency, and
 * Managers have no login of their own, so neither ever stores credentials.
 */
export function canManageCarrierLogin(user: Pick<AppUser, "role" | "agentType">): boolean {
  return user.role === "owner" || (user.role === "agent" && user.agentType === "independent");
}
