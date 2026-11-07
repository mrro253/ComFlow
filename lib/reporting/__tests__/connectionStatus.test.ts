import { describe, expect, it } from "vitest";
import { connectionPresentation, connectionSyncBusy } from "../connectionStatus";
const connection = { status: "active" as const, syncRequestedAt: null, lastError: null };
describe("truthful connection update states", () => {
  it("treats queued, collecting and both carrier verification formats as busy", () => {
    expect(connectionSyncBusy({ ...connection, syncRequestedAt: "2026-11-07" })).toBe(true);
    for (const lastError of ["Sync running. Reading statements.", "Verification needed. Enter a code.", "SunFire needs verification. Enter a code."]) {
      const state = { ...connection, status: "needs_attention" as const, lastError };
      expect(connectionSyncBusy(state)).toBe(true);
      if (!lastError.startsWith("Sync running.")) expect(connectionPresentation(state).label).toBe("Enter security code");
    }
  });
  it("allows retry after a failure without mistaking old verification wording for active MFA", () => {
    for (const lastError of ["UnitedHealthcare paused: Verification needed.", "The carrier rejected the login.", "Sign-in review needed."]) {
      expect(connectionSyncBusy({ ...connection, status: "needs_attention", lastError })).toBe(false);
    }
    expect(connectionSyncBusy({ ...connection, status: "disabled", syncRequestedAt: "2026-11-07" })).toBe(false);
  });
  it("shows queued updates above stale connected/error states", () => {
    for (const status of ["active", "needs_attention", "pending"] as const) {
      expect(connectionPresentation({ ...connection, status, syncRequestedAt: "2026-10-23", lastError: "Old failure" })).toMatchObject({ label: "Update queued", notice: expect.stringContaining("Results are not available yet") });
    }
  });
  it("distinguishes running work and sign-in review without claiming zero statements", () => {
    expect(connectionPresentation({ ...connection, status: "needs_attention", lastError: "Sync running. Reading statements." })).toMatchObject({ label: "Update in progress", variant: "secondary" });
    expect(connectionPresentation({ ...connection, status: "needs_attention", lastError: "Carrier verification or sign-in review is needed." }).label).toBe("Sign-in needs attention");
    expect(connectionPresentation({ ...connection, status: "needs_attention" }).notice).toContain("availability has not been confirmed");
  });
  it("never presents a disconnected account as queued or running", () => {
    expect(connectionPresentation({ ...connection, status: "disabled", syncRequestedAt: "2026-10-23" }).label).toBe("Disconnected");
  });
});
