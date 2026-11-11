import { beforeEach, describe, expect, it, vi } from "vitest";
import { readAuthorizedSaleSource, appendSaleEvent, validateSaleAgent } from "../saleDispositionRepository";
import { syntheticSunfireCollection } from "@/lib/enrollments/__fixtures__/sunfireCollection";
import { sunfireCollectionHash, sunfireCollectionBytes } from "@/lib/enrollments/sunfire";
import type { CurrentUser } from "@/types/domain";
const mocks = vi.hoisted(() => ({ events: vi.fn(), session: vi.fn(), owner: vi.fn(), download: vi.fn(), insert: vi.fn(), eq: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ from: () => {
  const q = { select: () => q, eq: (...args: unknown[]) => { mocks.eq(...args); return q; }, single: mocks.session }; return q;
} }) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: (table: string) => {
  const q = { select: () => q, eq: (...args: unknown[]) => { mocks.eq(...args); return q; }, in: () => q, order: () => q,
    range: mocks.events, insert: mocks.insert, single: () => table === "carrier_connections" ? Promise.resolve({ data: { id: "33333333-3333-4333-8333-333333333333" }, error: null }) : mocks.owner() }; return q;
}, storage: { from: () => ({ download: mocks.download }) } }) }));
const source = syntheticSunfireCollection(); source.connectionId = "33333333-3333-4333-8333-333333333333";
const hash = sunfireCollectionHash(source), code = source.records[0].code;
const owner = { id: source.userId, agencyId: source.agencyId, role: "owner", active: true, firstName: "Example", lastName: "Owner" } as CurrentUser;
const agent = { ...owner, id: "44444444-4444-4444-8444-444444444444", role: "agent" } as CurrentUser;
const event = { id: "1", created_at: "2026-10-22T12:00:00Z", actor_user_id: owner.id, entity_id: hash,
  details: { version: 1, kind: "assignment", ownerId: owner.id, actorName: "Example Owner", enrollmentCode: code, agentId: agent.id } };
beforeEach(() => { vi.clearAllMocks(); mocks.session.mockResolvedValue({ data: { id: agent.id }, error: null }); mocks.events.mockResolvedValue({ data: [], error: null }); mocks.owner.mockResolvedValue({ data: { id: owner.id, role: "owner" }, error: null }); mocks.download.mockResolvedValue({ data: new Blob([sunfireCollectionBytes(source).toString()]), error: null }); mocks.insert.mockResolvedValue({ error: null }); });
describe("assigned-sale repository authorization", () => {
  it("denies guessed source references and unassigned or reassigned agents before storage access", async () => {
    await expect(readAuthorizedSaleSource(agent, owner.id, hash, code)).rejects.toThrow("not assigned"); expect(mocks.download).not.toHaveBeenCalled();
    mocks.events.mockResolvedValue({ data: [event, { ...event, id: "2", created_at: "2026-10-22T13:00:00Z", details: { ...event.details, agentId: null } }], error: null });
    await expect(readAuthorizedSaleSource(agent, owner.id, hash, code)).rejects.toThrow("not assigned"); expect(mocks.download).not.toHaveBeenCalled();
  });
  it("verifies source tenant, owner, connection and bytes for assigned agents", async () => {
    mocks.events.mockResolvedValue({ data: [event], error: null });
    expect(await readAuthorizedSaleSource(agent, owner.id, hash, code)).toEqual(source.records[0]);
    expect(mocks.eq).toHaveBeenCalledWith("agency_id", source.agencyId);
    const foreign = { ...source, agencyId: "55555555-5555-4555-8555-555555555555" };
    mocks.download.mockResolvedValue({ data: new Blob([sunfireCollectionBytes(foreign).toString()]), error: null });
    await expect(readAuthorizedSaleSource(agent, owner.id, hash, code)).rejects.toThrow("integrity");
    mocks.download.mockResolvedValue({ data: new Blob(["private invalid source content"]), error: null });
    await expect(readAuthorizedSaleSource(agent, owner.id, hash, code)).rejects.toThrow("Sale source integrity failed.");
  });
  it("blocks inactive profiles, cross-owner access and assignment changes by agents", async () => {
    mocks.session.mockResolvedValueOnce({ data: null, error: null }); await expect(readAuthorizedSaleSource(agent, owner.id, hash, code)).rejects.toThrow("access");
    await expect(readAuthorizedSaleSource(owner, agent.id, hash, code)).rejects.toThrow("not assigned");
    await expect(validateSaleAgent(agent, owner.id)).rejects.toThrow("Owner required"); expect(mocks.insert).not.toHaveBeenCalled();
  });
  it("rechecks assignment before saving and appends actor-scoped history only", async () => {
    await expect(appendSaleEvent(agent, owner.id, hash, code, { kind: "disposition", status: "Inactive", note: "Synthetic note" })).rejects.toThrow("not assigned");
    expect(mocks.insert).not.toHaveBeenCalled();
    mocks.events.mockResolvedValue({ data: [event], error: null });
    await appendSaleEvent(agent, owner.id, hash, code, { kind: "disposition", status: "Inactive", note: "Synthetic note" });
    expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({ agency_id: agent.agencyId, actor_user_id: agent.id, action: "sunfire.sale_disposition_updated", details: expect.objectContaining({ ownerId: owner.id, enrollmentCode: code, status: "Inactive", note: "Synthetic note" }) }));
  });
});
