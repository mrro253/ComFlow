/**
 * Whose statement a portal download is. An Independent agent's own login
 * produces THEIR statement (the carrier pays them directly), so everything on it
 * belongs to them. The Owner's login (or any other) produces the agency's
 * statement, whose rows are attributed by writing-agent name in the web app.
 */
export function statementOwnerUserId(user: {
  id: string;
  role: string;
  agent_type: string | null;
}): string | null {
  return user.role === "agent" && user.agent_type === "independent" ? user.id : null;
}
