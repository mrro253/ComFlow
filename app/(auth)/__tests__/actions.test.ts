import { beforeEach, describe, expect, it, vi } from "vitest";

// vi.mock factories are hoisted above these declarations, so the mocks they
// reference must be created via vi.hoisted() rather than plain top-level
// consts (which would be TDZ-inaccessible at hoist time).
const { signOutMock, revalidatePathMock, redirectMock, signInMock } = vi.hoisted(() => ({
  signInMock: vi.fn().mockResolvedValue({ error: null }),
  signOutMock: vi.fn().mockResolvedValue({ error: null }),
  revalidatePathMock: vi.fn(),
  redirectMock: vi.fn((path: string) => {
    // Mirrors Next.js's real redirect(), which throws to unwind the call stack.
    throw new Error(`REDIRECT:${path}`);
  }),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { signOut: signOutMock, signInWithPassword: signInMock },
  })),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(),
}));

vi.mock("@/lib/auth/getCurrentUser", () => ({
  getCurrentUser: vi.fn(),
}));

vi.mock("@/lib/repositories/agencyRepository", () => ({
  getAgencyById: vi.fn(),
  provisionAgencyForOwner: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

vi.mock("next/cache", () => ({
  revalidatePath: revalidatePathMock,
}));

import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { signOut, login } from "@/app/(auth)/actions";

describe("signOut", () => {
  beforeEach(() => {
    signOutMock.mockClear();
    revalidatePathMock.mockClear();
    redirectMock.mockClear();
  });

  it("clears the Supabase session, invalidates the router cache, and redirects to /login", async () => {
    await expect(signOut()).rejects.toThrow("REDIRECT:/login");

    expect(signOutMock).toHaveBeenCalledTimes(1);
    // Invalidating the whole layout is what prevents browser back-navigation
    // from showing a stale, cached dashboard render after sign-out.
    expect(revalidatePathMock).toHaveBeenCalledWith("/", "layout");
    expect(redirectMock).toHaveBeenCalledWith("/login");
  });
});

describe("inactive account login", () => {
  it("clears a valid auth session when no active application profile is available", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null); signOutMock.mockClear(); redirectMock.mockClear();
    const form = new FormData(); form.set("email", "synthetic@example.invalid"); form.set("password", "synthetic-only");
    expect(await login(undefined, form)).toEqual({ error: "Your account is unavailable or inactive. Contact your agency owner." });
    expect(signOutMock).toHaveBeenCalledOnce(); expect(redirectMock).not.toHaveBeenCalled();
  });
});
