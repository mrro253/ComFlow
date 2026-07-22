import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import type { CurrentUser, Role } from "@/types/domain";

export class UnauthorizedError extends Error {
  constructor(message = "Unauthorized") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

/**
 * Guard for Server Actions / Route Handlers. Throws `UnauthorizedError`
 * if there's no session, or if `allowedRoles` is given and the current
 * user's role isn't included.
 *
 * Note: this is a UX/defense-in-depth layer, not the source of truth for
 * data access - Row Level Security policies in the database are what
 * actually enforce tenant isolation and role scoping.
 */
export async function requireRole(
  allowedRoles?: Role[]
): Promise<CurrentUser> {
  const user = await getCurrentUser();

  if (!user) {
    throw new UnauthorizedError("You must be signed in.");
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    throw new UnauthorizedError(
      `This action requires one of the following roles: ${allowedRoles.join(", ")}.`
    );
  }

  return user;
}
