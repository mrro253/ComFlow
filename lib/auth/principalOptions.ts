import type { AppUser } from "@/types/domain";

/** Teammates who can be a captive agent's principal: active and not captive themselves. */
export function principalOptions(
  users: readonly Pick<AppUser, "id" | "firstName" | "lastName" | "active" | "agentType">[],
  excludeId: string | null = null
): { id: string; name: string }[] {
  return users
    .filter((u) => u.active && u.agentType !== "captive" && u.id !== excludeId)
    .map((u) => ({ id: u.id, name: `${u.firstName} ${u.lastName}` }));
}
