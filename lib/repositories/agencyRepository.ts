import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/types/database";
import type { Agency } from "@/types/domain";

type AgencyRow = Database["public"]["Tables"]["agencies"]["Row"];

function mapAgencyRow(row: AgencyRow): Agency {
  return {
    id: row.id,
    name: row.name,
    onboardingCompletedAt: row.onboarding_completed_at,
    createdAt: row.created_at,
  };
}

export async function getAgencyById(id: string): Promise<Agency | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("agencies")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !data) return null;
  return mapAgencyRow(data);
}

/**
 * Privileged, session-independent signup bootstrap: creates the agency, its
 * Owner profile, and a default commission plan (with seeded rates) in a
 * single atomic database transaction via the `create_agency_with_owner`
 * SECURITY DEFINER function (see supabase/migrations/0004_owner_onboarding.sql).
 *
 * Deliberately uses the service-role admin client instead of the session
 * client: right after `supabase.auth.signUp()`, a browser session may not
 * exist yet (e.g. when the project requires email confirmation), so any
 * RLS-scoped `authenticated` insert would fail. This function - and the
 * database function it calls - is the ONLY legitimate way to create an
 * agency; it is never reachable from the browser.
 */
export async function provisionAgencyForOwner(input: {
  authUserId: string;
  agencyName: string;
  firstName: string;
  lastName: string;
  email: string;
}): Promise<{ agencyId: string; userId: string; commissionPlanId: string | null }> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("create_agency_with_owner", {
    p_auth_user_id: input.authUserId,
    p_agency_name: input.agencyName,
    p_first_name: input.firstName,
    p_last_name: input.lastName,
    p_email: input.email,
  });

  if (error || !data || data.length === 0) {
    throw new Error(error?.message ?? "Failed to set up your agency.");
  }

  const row = data[0];
  return {
    agencyId: row.agency_id,
    userId: row.user_id,
    commissionPlanId: row.commission_plan_id,
  };
}

/** Owner-initiated rename, e.g. from the onboarding "welcome" step. */
export async function updateAgencyName(agencyId: string, name: string): Promise<Agency> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("agencies")
    .update({ name })
    .eq("id", agencyId)
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to update agency name");
  }
  return mapAgencyRow(data);
}

/**
 * Marks onboarding as done. Used for both an explicit "Finish setup" and
 * "I'll finish later"/dismiss - the app intentionally doesn't distinguish
 * completion from dismissal (see agencies.onboarding_completed_at).
 */
export async function completeAgencyOnboarding(agencyId: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("agencies")
    .update({ onboarding_completed_at: new Date().toISOString() })
    .eq("id", agencyId);

  if (error) {
    throw new Error(error.message);
  }
}
