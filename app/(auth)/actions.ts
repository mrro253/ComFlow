"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAgency } from "@/lib/repositories/agencyRepository";
import { createUserProfile } from "@/lib/repositories/userRepository";
import { createDefaultPlanForNewAgency } from "@/lib/repositories/commissionPlanRepository";

export interface ActionResult {
  error?: string;
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

  redirect("/dashboard");
}

/**
 * First-time signup: creates a new Agency and its Owner user in one flow.
 * There is intentionally no "join an existing agency" option in the MVP -
 * additional teammates are added by the Owner from Settings.
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

  const supabase = await createClient();
  const { data: authData, error: signUpError } = await supabase.auth.signUp({
    email,
    password,
  });

  if (signUpError || !authData.user) {
    return { error: signUpError?.message ?? "Failed to create account." };
  }

  try {
    const agency = await createAgency(agencyName);
    await createUserProfile({
      id: authData.user.id,
      agencyId: agency.id,
      firstName,
      lastName,
      email,
      role: "owner",
    });
    await createDefaultPlanForNewAgency(agency.id);
  } catch (err) {
    return {
      error:
        err instanceof Error
          ? err.message
          : "Failed to finish setting up your agency.",
    };
  }

  redirect("/dashboard");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
