import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ user: vi.fn(), client: vi.fn(), fetch: vi.fn() }));
vi.mock("@/lib/auth/getCurrentUser", () => ({ getCurrentUser: mocks.user }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.client }));
import { POST } from "./route";
const id = "11111111-1111-4111-8111-111111111111", other = "22222222-2222-4222-8222-222222222222";
function request(value: object = {}, origin = "https://comflow.example") {
  return new Request("https://comflow.example/api/carriers/verification", { method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify({ connectionId: id, action: "state", ...value }) });
}
beforeEach(() => {
  vi.unstubAllEnvs(); vi.clearAllMocks();
  vi.stubEnv("HOSTED_VERIFICATION_ENABLED", "true"); vi.stubEnv("WORKER_VERIFICATION_URL", "https://private-worker.example/verification"); vi.stubEnv("WORKER_VERIFICATION_KEY", Buffer.alloc(32,7).toString("base64"));
  mocks.user.mockResolvedValue({ id, agencyId: other, role: "owner" });
  vi.stubGlobal("fetch", mocks.fetch);
});
it("denies unsigned users and cross-site submissions without contacting the worker", async () => {
  expect((await POST(request({}, "https://evil.example"))).status).toBe(403);
  mocks.user.mockResolvedValue(null); expect((await POST(request())).status).toBe(401);
  expect(mocks.fetch).not.toHaveBeenCalled();
});
it("requires the exact connection owner even for agency owners", async () => {
  const query = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), neq: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data: null }) };
  mocks.client.mockResolvedValue({ from: () => query });
  expect((await POST(request())).status).toBe(403);
  expect(query.eq.mock.calls).toEqual([["id",id],["user_id",id],["agency_id",other]]);
  expect(mocks.fetch).not.toHaveBeenCalled();
});
it("derives agency and user identity on the server and never returns carrier content", async () => {
  const query = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), neq: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data: { id } }) };
  mocks.client.mockResolvedValue({ from: () => query });
  mocks.fetch.mockResolvedValue(Response.json({ status: "ready", sessionId: id, acceptsCode: true, choices: ["sms","navigate"], html: "private carrier page" }));
  const response = await POST(request({ userId: other, agencyId: id }));
  expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toContain("no-store");
  const sent = JSON.parse(mocks.fetch.mock.calls[0][1].body);
  expect(sent.userId).toBe(id); expect(sent.agencyId).toBe(other);
  expect(await response.json()).toEqual({ status: "ready", sessionId: id, acceptsCode: true, choices: ["sms"] });
});
