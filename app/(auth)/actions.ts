"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import {
  getAgencyById,
  provisionAgencyForOwner,
} from "@/lib/repositories/agencyRepository";
import { isOnboardingIncomplete } from "@/lib/onboarding";

export interface ActionResult {
  error?: string;
  /** Non-error, user-facing status (e.g. "check your email to confirm"). */
  info?: string;
}

/** Where a just-authenticated user should land: Owners with unfinished
 *  onboarding go there first; everyone else goes straight to the dashboard. */
async function postAuthRedirectPath(): Promise<string> {
  const user = await getCurrentUser();
  if (user?.role === "owner") {
    const agency = await getAgencyById(user.agencyId);
    if (agency && isOnboardingIncomplete(agency)) {
      return "/onboarding";
    }
  }
  return "/dashboard";
}

export async function login(
  _prevState: ActionResult | undefined,
  formData: FormData
): Promise<ActionResult> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Email and password are required." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: error.message };
  }

  redirect(await postAuthRedirectPath());
}

/**
 * First-time signup: creates a new Agency and its Owner user in one flow.
 * There is intentionally no "join an existing agency" option in the MVP -
 * additional teammates are added by the Owner from Settings.
 *
 * Agency/profile/plan provisioning is done by `provisionAgencyForOwner`
 * (a privileged, service-role RPC call) rather than by inserting through
 * this request's session client. That's deliberate: right after
 * `supabase.auth.signUp()`, a browser session may not exist yet (e.g. when
 * the Supabase project requires email confirmation), so an RLS-scoped
 * insert as `authenticated` would fail with "new row violates row-level
 * security policy" even though the signup itself succeeded. Provisioning
 * this way works identically regardless of the project's email-confirmation
 * setting.
 */
export async function signup(
  _prevState: ActionResult | undefined,
  formData: FormData
): Promise<ActionResult> {
  const agencyName = String(formData.get("agencyName") ?? "").trim();
  const firstName = String(formData.get("firstName") ?? "").trim();
  const lastName = String(formData.get("lastName") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!agencyName || !firstName || !lastName || !email || !password) {
    return { error: "All fields are required." };
  }
  if (password.length < 8) {
    return { error: "Password must be at least 8 characters." };
  }

  const supabase = await createClient();
  const { data: authData, error: signUpError } = await supabase.auth.signUp({
    email,
    password,
  });

  if (signUpError) {
    return { error: signUpError.message };
  }
  if (!authData.user) {
    return { error: "Failed to create account." };
  }

  try {
    await provisionAgencyForOwner({
      authUserId: authData.user.id,
      agencyName,
      firstName,
      lastName,
      email,
    });
  } catch (err) {
    // Provisioning failed after the auth user was created - roll it back so
    // the email address isn't stuck "half-registered" and the Owner can
    // simply retry signup.
    await createAdminClient()
      .auth.admin.deleteUser(authData.user.id)
      .catch(() => {});
    return {
      error:
        err instanceof Error
          ? err.message
          : "Failed to finish setting up your agency.",
    };
  }

  // No session yet means the project requires email confirmation - the
  // agency/owner/plan already exist, but we can't put them in a signed-in
  // dashboard state without a session cookie. Direct them to confirm first.
  if (!authData.session) {
    return {
      info: "Account created! Check your email to confirm your address, then sign in.",
    };
  }

  redirect("/onboarding");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  // Dashboard routes are dynamically rendered, but Next's client Router
  // Cache can still serve a stale cached render for a short window after
  // the session cookie is cleared - without this, pressing "back" after
  // signing out could show the previous (now-unauthenticated) dashboard
  // render instead of re-checking the session.
  revalidatePath("/", "layout");
  redirect("/login");
}
