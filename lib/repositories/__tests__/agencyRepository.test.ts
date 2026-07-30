import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

import { createAdminClient } from "@/lib/supabase/admin";
import { provisionAgencyForOwner } from "@/lib/repositories/agencyRepository";

describe("provisionAgencyForOwner", () => {
  const input = {
    authUserId: "auth-user-1",
    agencyName: "Acme Medicare Advisors",
    firstName: "Jane",
    lastName: "Owner",
    email: "jane@acme.test",
  };

  beforeEach(() => {
    vi.mocked(createAdminClient).mockReset();
  });

  it("provisions the agency via the privileged RPC using only the auth user id - never a client-supplied agency id", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{ agency_id: "agency-1", user_id: "auth-user-1", commission_plan_id: "plan-1" }],
      error: null,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(createAdminClient).mockReturnValue({ rpc } as any);

    const result = await provisionAgencyForOwner(input);

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("create_agency_with_owner", {
      p_auth_user_id: input.authUserId,
      p_agency_name: input.agencyName,
      p_first_name: input.firstName,
      p_last_name: input.lastName,
      p_email: input.email,
    });

    const [, args] = rpc.mock.calls[0] as [string, Record<string, unknown>];
    expect(args).not.toHaveProperty("agency_id");
    expect(args).not.toHaveProperty("agencyId");

    expect(result).toEqual({
      agencyId: "agency-1",
      userId: "auth-user-1",
      commissionPlanId: "plan-1",
    });
  });

  it("throws a descriptive error when the database call fails, so callers can roll back the auth user", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: "boom" } });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(createAdminClient).mockReturnValue({ rpc } as any);

    await expect(provisionAgencyForOwner(input)).rejects.toThrow("boom");
  });
});
