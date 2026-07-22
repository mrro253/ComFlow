import { createClient } from "@/lib/supabase/server";
import type { CurrentUser } from "@/types/domain";
import { mapUserRow } from "@/lib/repositories/userRepository";

/**
 * Returns the signed-in user merged with their `public.users` profile
 * (role, agency, manager). Returns `null` if there is no session or the
 * profile row hasn't been created yet.
 *
 * This is the single place server code should look up "who is asking" -
 * route handlers, server actions, and Server Components should all go
 * through this instead of querying Supabase auth directly.
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const supabase = await createClient();

  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  if (!authUser) return null;

  const { data: profile, error } = await supabase
    .from("users")
    .select("*")
    .eq("id", authUser.id)
    .single();

  if (error || !profile) return null;

  return {
    authUserId: authUser.id,
    ...mapUserRow(profile),
  };
}
