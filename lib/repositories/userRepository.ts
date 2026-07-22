import { createClient, type TypedSupabaseClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/types/database";
import type { AppUser, Role } from "@/types/domain";

type UserRow = Database["public"]["Tables"]["users"]["Row"];

export function mapUserRow(row: UserRow): AppUser {
  return {
    id: row.id,
    agencyId: row.agency_id,
    firstName: row.first_name,
    lastName: row.last_name,
    email: row.email,
    role: row.role,
    managerId: row.manager_id,
    commissionPlanId: row.commission_plan_id,
    createdAt: row.created_at,
  };
}

export async function getUserById(
  id: string,
  client?: TypedSupabaseClient
): Promise<AppUser | null> {
  const supabase = client ?? (await createClient());
  const { data, error } = await supabase
    .from("users")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !data) return null;
  return mapUserRow(data);
}

export async function listUsersForAgency(agencyId: string): Promise<AppUser[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("users")
    .select("*")
    .eq("agency_id", agencyId)
    .order("created_at", { ascending: true });

  if (error || !data) return [];
  return data.map(mapUserRow);
}

/** Returns the agency's Owner (MVP assumes exactly one per agency). */
export async function getAgencyOwner(
  agencyId: string,
  client?: TypedSupabaseClient
): Promise<AppUser | null> {
  const supabase = client ?? (await createClient());
  const { data, error } = await supabase
    .from("users")
    .select("*")
    .eq("agency_id", agencyId)
    .eq("role", "owner")
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  return mapUserRow(data);
}

/** Returns the given manager's direct reports (used to scope Manager dashboards). */
export async function listDirectReports(managerId: string): Promise<AppUser[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("users")
    .select("*")
    .eq("manager_id", managerId);

  if (error || !data) return [];
  return data.map(mapUserRow);
}

/** Creates the `public.users` profile row for an auth user. Used at signup. */
export async function createUserProfile(input: {
  id: string;
  agencyId: string;
  firstName: string;
  lastName: string;
  email: string;
  role: Role;
  managerId?: string | null;
}): Promise<AppUser> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("users")
    .insert({
      id: input.id,
      agency_id: input.agencyId,
      first_name: input.firstName,
      last_name: input.lastName,
      email: input.email,
      role: input.role,
      manager_id: input.managerId ?? null,
    })
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to create user profile");
  }
  return mapUserRow(data);
}

/**
 * Owner-initiated "add teammate" flow. Creates the Supabase Auth user via
 * the admin API (service-role key, server-only) and the matching
 * `public.users` profile row.
 *
 * TODO: replace the auto-generated temporary password with a proper
 * email invite (Supabase `inviteUserByEmail`) once outbound email is
 * configured for the project.
 */
export async function createUserWithAuth(input: {
  agencyId: string;
  firstName: string;
  lastName: string;
  email: string;
  role: Role;
  managerId?: string | null;
}): Promise<{ user: AppUser; temporaryPassword: string }> {
  const admin = createAdminClient();
  const temporaryPassword = generateTemporaryPassword();

  const { data: authData, error: authError } =
    await admin.auth.admin.createUser({
      email: input.email,
      password: temporaryPassword,
      email_confirm: true,
    });

  if (authError || !authData.user) {
    throw new Error(authError?.message ?? "Failed to create auth user");
  }

  const { data, error } = await admin
    .from("users")
    .insert({
      id: authData.user.id,
      agency_id: input.agencyId,
      first_name: input.firstName,
      last_name: input.lastName,
      email: input.email,
      role: input.role,
      manager_id: input.managerId ?? null,
    })
    .select("*")
    .single();

  if (error || !data) {
    // Roll back the auth user so we don't leave an orphaned account behind.
    await admin.auth.admin.deleteUser(authData.user.id);
    throw new Error(error?.message ?? "Failed to create user profile");
  }

  return { user: mapUserRow(data), temporaryPassword };
}

/**
 * Owner-initiated hierarchy edit: renames a teammate, and/or changes their
 * role or manager assignment. Does not touch `email`/auth - those are
 * intentionally out of scope for MVP (avoids re-verifying a changed email
 * against Supabase Auth).
 */
export async function updateUserProfile(
  id: string,
  updates: {
    firstName: string;
    lastName: string;
    role: "manager" | "agent";
    managerId: string | null;
    /** `undefined` leaves the current assignment untouched; `null` clears it (falls back to the agency default plan). */
    commissionPlanId?: string | null;
  }
): Promise<AppUser> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("users")
    .update({
      first_name: updates.firstName,
      last_name: updates.lastName,
      role: updates.role,
      manager_id: updates.managerId,
      ...(updates.commissionPlanId !== undefined && {
        commission_plan_id: updates.commissionPlanId,
      }),
    })
    .eq("id", id)
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to update teammate");
  }
  return mapUserRow(data);
}

function generateTemporaryPassword(): string {
  return `Cf-${Math.random().toString(36).slice(2, 10)}!${Math.floor(Math.random() * 100)}`;
}
