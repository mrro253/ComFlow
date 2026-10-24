import { describe, expect, it } from "vitest";
import { connectionPresentation } from "../connectionStatus";
const connection = { status: "active" as const, syncRequestedAt: null, lastError: null };
describe("truthful connection update states", () => {
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
