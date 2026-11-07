import { beforeEach, describe, expect, it, vi } from "vitest";
import { saveCarrierCredentials, syncCarrierNow } from "../actions";
const mock = vi.hoisted(() => ({ user: { id: "owner", agencyId: "agency", role: "owner", agentType: null, active: true }, connectionUser: "owner", status: "pending", lastError: null as string | null, syncRequestedAt: null as string | null, save: vi.fn(), request: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/requireRole", () => ({ requireRole: async () => mock.user }));
vi.mock("@/lib/repositories/carrierConnectionRepository", () => ({ saveCarrierLogin: mock.save, requestSync: mock.request, disconnectCarrier: vi.fn(), listVisibleConnections: async () => [{ id: "connection", userId: mock.connectionUser, carrier: "SunFire", status: mock.status, lastError: mock.lastError, syncRequestedAt: mock.syncRequestedAt }] }));
beforeEach(() => { vi.clearAllMocks(); mock.user.role = "owner"; mock.user.active = true; mock.connectionUser = "owner"; mock.status = "pending"; mock.lastError = null; mock.syncRequestedAt = null; });
function form() { const data = new FormData(); for (const [key, value] of Object.entries({ carrier: "SunFire", username: "synthetic", password: "synthetic-password", portalUrl: "https://www.sunfirematrix.com/app/agent/example/", enrollmentStart: "2026-01-01", connectionId: "connection" })) data.set(key, value); return data; }
describe("SunFire connection actions", () => {
  it.each(["queued", "collecting", "verification"])("does not queue a second request while %s", async (phase) => {
    mock.status = "needs_attention";
    if (phase === "queued") mock.syncRequestedAt = "2026-11-07T12:00:00Z";
    else mock.lastError = phase === "collecting" ? "Sync running. Reading enrollments." : "SunFire needs verification. Enter your code.";
    expect((await syncCarrierNow(undefined, form()))?.info).toContain("already queued or running");
    expect(mock.request).not.toHaveBeenCalled();
  });
  it("saves the per-agency starting URL with the encrypted-login input, and queues only collection", async () => {
    expect((await saveCarrierCredentials(undefined, form()))?.info).toContain("Commission records stay unchanged");
    expect(mock.save).toHaveBeenCalledWith(expect.objectContaining({ login: expect.objectContaining({ portalUrl: "https://www.sunfirematrix.com/app/agent/example/", enrollmentStart: "2026-01-01" }) }));
    expect((await syncCarrierNow(undefined, form()))?.info).toContain("no commissions are imported");
    expect(mock.request).toHaveBeenCalledWith("agency", "connection");
  });
  it("rejects untrusted portal URLs and cross-owner or inactive syncs", async () => {
    const bad = form(); bad.set("portalUrl", "https://example.invalid/");
    expect((await saveCarrierCredentials(undefined, bad))?.error).toBeTruthy(); expect(mock.save).not.toHaveBeenCalled();
    mock.connectionUser = "other-owner"; expect((await syncCarrierNow(undefined, form()))?.error).toBeTruthy();
    mock.connectionUser = "owner"; mock.user.active = false; expect((await syncCarrierNow(undefined, form()))?.error).toBeTruthy();
    expect(mock.request).not.toHaveBeenCalled();
  });
});
