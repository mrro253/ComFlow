import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

/**
 * Admin client using the service-role key. Bypasses Row Level Security.
 *
 * SERVER-ONLY. Never import this from a Client Component or expose
 * `SUPABASE_SERVICE_ROLE_KEY` to the browser bundle. Currently used only to
 * create auth users when an Owner adds a teammate from Settings (see
 * `lib/repositories/userRepository.ts`).
 */
export function createAdminClient() {
  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}
