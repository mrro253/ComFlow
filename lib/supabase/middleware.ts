import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/types/database";

const PUBLIC_PATHS = ["/login", "/signup"];

/**
 * Refreshes the Supabase auth session on every request and redirects
 * unauthenticated users away from protected routes. Called from the root
 * `middleware.ts`.
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(
          cookiesToSet: {
            name: string;
            value: string;
            options: CookieOptions;
          }[]
        ) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isPublicPath = PUBLIC_PATHS.some((p) => path.startsWith(p));
  // API routes authenticate/authorize themselves (e.g. the statement PDF route
  // checks the session and role and answers 401/403) - redirecting them to
  // /login would hand a fetch an HTML page instead.
  const isApiPath = path.startsWith("/api/");

  if (!user && !isPublicPath && !isApiPath) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // Don't auto-redirect authenticated users away from /login or /signup.
  // The auth layout checks for a full profile (auth + public.users row)
  // before sending them to /dashboard. Redirecting here on auth cookie
  // alone caused a loop when the profile query failed (e.g. missing DB
  // table grants): middleware -> /dashboard, layout -> /login, repeat.

  return supabaseResponse;
}
