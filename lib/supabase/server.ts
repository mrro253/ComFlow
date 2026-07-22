import { createServerClient, type CookieOptions } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import type { Database } from "@/types/database";

/** Shared type for a Supabase client bound to our schema, regardless of
 *  whether it's session-scoped (RLS) or the admin/service-role client. */
export type TypedSupabaseClient = SupabaseClient<Database>;

/**
 * Supabase client for use in Server Components, Server Actions, and Route
 * Handlers. Reads/writes the auth cookie via Next.js's `cookies()` API.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(
          cookiesToSet: {
            name: string;
            value: string;
            options: CookieOptions;
          }[]
        ) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Called from a Server Component - middleware handles session
            // refresh in that case, so this can be safely ignored.
          }
        },
      },
    }
  );
}
