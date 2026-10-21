import { beforeEach, expect, it, vi } from "vitest";
import { loadSyncResult } from "./syncResultRepository";
const mocks = vi.hoisted(() => ({ visible: vi.fn(), download: vi.fn(), admin: vi.fn(), eq: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ from: () => ({ select: () => ({ eq: mocks.eq }) }) }) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.admin }));
beforeEach(() => {
  vi.resetAllMocks();
  const chain = { eq: mocks.eq, maybeSingle: mocks.visible };
  mocks.eq.mockReturnValue(chain);
  mocks.admin.mockReturnValue({ storage: { from: () => ({ download: mocks.download }) } });
  mocks.visible.mockResolvedValue({ data: { id: "connection", agency_id: "agency", carrier: "Example" }, error: null });
});
it("does not touch admin storage unless the connection is session-visible in the requested agency", async () => {
  mocks.visible.mockResolvedValue({ data: null, error: null });
  expect(await loadSyncResult("hidden", "agency")).toBeNull();
  expect(mocks.eq).toHaveBeenCalledWith("agency_id", "agency");
  expect(mocks.admin).not.toHaveBeenCalled();
});
it("loads only the authorized operational path and rejects mismatched metadata", async () => {
  mocks.download.mockResolvedValue({ data: new Blob([JSON.stringify({ version: 1, connectionId: "other", carrier: "Example" })]), error: null });
  expect(await loadSyncResult("connection", "agency")).toBeNull();
  expect(mocks.download).toHaveBeenCalledWith("agency/sync-results/connection/latest.json");
});
it("treats missing or malformed stored summaries as unavailable", async () => {
  mocks.download.mockResolvedValue({ data: new Blob(["not json"]), error: null });
  expect(await loadSyncResult("connection", "agency")).toBeNull();
});
