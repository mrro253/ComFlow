import { beforeEach, describe, expect, it, vi } from "vitest";
import { syncDevotedConnection } from "../devotedSync";
import type { ConnectionRow, Db } from "../db";
const mocks = vi.hoisted(() => ({ launch: vi.fn(), pull: vi.fn(), mark: vi.fn(), wait: vi.fn(), goto: vi.fn(), connected: true }));
vi.mock("../carrierLogin.js", () => ({ automaticCarrierLogin: () => mocks.wait() }));
vi.mock("playwright", () => ({ chromium: { launch: mocks.launch } }));
vi.mock("../carriers/devotedDownload.js", () => ({ syncDevotedPage: mocks.pull }));
vi.mock("../db.js", () => ({ loadCiphertext: async () => "encrypted", markConnection: mocks.mark }));
vi.mock("../../../lib/crypto/credentials", () => ({ decryptCarrierLogin: () => ({ username: "synthetic", password: "synthetic" }) }));
function db() {
  const query = { select: () => query, eq: () => query, maybeSingle: async () => ({ data: { role: "owner", active: true }, error: null }) };
  return { from: () => query } as unknown as Db;
}
beforeEach(() => {
  vi.clearAllMocks(); mocks.connected = true;
  const page = { isClosed: () => false, goto: mocks.goto, url: () => "https://agent.devoted.com/commissions", locator: () => ({ count: async () => 0 }), getByRole: () => ({ waitFor: mocks.wait }) };
  mocks.launch.mockResolvedValue({ isConnected: () => mocks.connected, newContext: async () => ({ newPage: async () => page }) });
  mocks.pull.mockResolvedValue({ found: 1, downloaded: 0, skipped: 1, failed: 0 });
});
describe("Devoted interactive session reuse", () => {
  it("retains the same browser after verification timeout and retries in it", async () => {
    const connection = { id: "session-retry", agency_id: "agency", user_id: "owner" } as ConnectionRow;
    mocks.wait.mockRejectedValueOnce(new Error("private browser diagnostic")).mockResolvedValueOnce(undefined);
    await expect(syncDevotedConnection(db(), connection)).rejects.toThrow("browser stays open");
    expect(await syncDevotedConnection(db(), connection)).toEqual({ found: 1, downloaded: 0, skipped: 1, failed: 0 });
    expect(mocks.launch).toHaveBeenCalledTimes(1);
    expect(mocks.pull).toHaveBeenCalledTimes(1);
    expect(mocks.mark).toHaveBeenCalledTimes(2);
  });
});
