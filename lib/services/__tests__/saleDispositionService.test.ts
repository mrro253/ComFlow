import { beforeEach, describe, expect, it, vi } from "vitest";
import { assignSale, listEditableSales, setSaleDisposition } from "../saleDispositionService";
import { syntheticSunfireCollection } from "@/lib/enrollments/__fixtures__/sunfireCollection";
import type { CurrentUser } from "@/types/domain";
const mocks = vi.hoisted(() => ({ list: vi.fn(), collection: vi.fn(), events: vi.fn(), source: vi.fn(), append: vi.fn(), agent: vi.fn() }));
vi.mock("@/lib/repositories/sunfireCollectionRepository", () => ({ listSunfireCollections: mocks.list, readSunfireCollection: mocks.collection }));
vi.mock("@/lib/repositories/saleDispositionRepository", () => ({ readSaleEvents: mocks.events, readAuthorizedSaleSource: mocks.source, appendSaleEvent: mocks.append, validateSaleAgent: mocks.agent }));
const collection = syntheticSunfireCollection(), hash = "a".repeat(64);
const owner = { id: collection.userId, agencyId: collection.agencyId, role: "owner", active: true } as CurrentUser;
const agent = { ...owner, id: "44444444-4444-4444-8444-444444444444", role: "agent" } as CurrentUser;
const assignment = { id: "1", recordedAt: "2026-10-22T12:00:00Z", kind: "assignment", actorId: owner.id, actorName: "Example Owner", ownerId: owner.id, collectionHash: hash, enrollmentCode: collection.records[0].code, agentId: agent.id };
beforeEach(() => { vi.clearAllMocks(); mocks.list.mockResolvedValue([{ hash }]); mocks.collection.mockResolvedValue(collection); mocks.events.mockResolvedValue([]); mocks.source.mockResolvedValue(collection.records[0]); });
describe("editable sales scope", () => {
  it("denies managers and inactive users before any private reads", async () => {
    await expect(listEditableSales({ ...agent, role: "manager" })).rejects.toThrow("assigned agent");
    await expect(listEditableSales({ ...agent, active: false })).rejects.toThrow("assigned agent"); expect(mocks.events).not.toHaveBeenCalled();
  });
  it("shows an owner's own collection without raw Medicare IDs and does not infer assignments", async () => {
    const sales = await listEditableSales(owner); expect(sales).toHaveLength(collection.records.length);
    expect(sales[0].assignedAgentId).toBeNull(); expect(JSON.stringify(sales)).not.toContain(collection.records[0].mbi);
    await expect(listEditableSales(owner, "b".repeat(64))).rejects.toThrow("Collection not found");
  });
  it("retains older applications and deduplicates refreshed snapshots by application code", async () => {
    const newHash = "b".repeat(64), oldHash = "c".repeat(64);
    const original = collection.records[0];
    const replacement = { ...original, code: "REPLACEMENT", proposedEffectiveDate: "2026-03-01" };
    mocks.list.mockResolvedValue([{ hash: newHash }, { hash }, { hash: oldHash }]);
    mocks.collection.mockImplementation(async (_user, reference) => ({ ...collection, records: reference === newHash ? [replacement] : [original] }));
    const rows = await listEditableSales(owner, undefined, true);
    expect(rows.map(row => row.code)).toEqual([replacement.code, original.code]);
    expect(rows[1].versions).toHaveLength(2);
    expect(rows[0].source?.mbi).toBe(rows[1].source?.mbi);
  });
  it("shows agents only currently assigned sales, including reassignment and revocation", async () => {
    expect(await listEditableSales(agent)).toEqual([]); expect(mocks.source).not.toHaveBeenCalled();
    mocks.events.mockResolvedValue([assignment]); expect(await listEditableSales(agent)).toHaveLength(1);
    expect(mocks.source).toHaveBeenCalledWith(agent, owner.id, hash, collection.records[0].code);
    mocks.events.mockResolvedValue([assignment, { ...assignment, id: "2", recordedAt: "2026-10-22T13:00:00Z", agentId: null }]);
    expect(await listEditableSales(agent)).toEqual([]);
  });
  it("validates all disposition inputs before the authorized repository write", async () => {
    await setSaleDisposition(agent, owner.id, hash, collection.records[0].code, "Future Active", "  Synthetic explanation  ");
    expect(mocks.append).toHaveBeenCalledWith(agent, owner.id, hash, collection.records[0].code, { kind: "disposition", status: "Future Active", note: "Synthetic explanation" });
    await expect(setSaleDisposition(agent, owner.id, hash, "OTHER", "Paid", "Explanation")).rejects.toThrow("Choose"); expect(mocks.append).toHaveBeenCalledTimes(1);
  });
  it("allows only owners to assign an active agency agent", async () => {
    await expect(assignSale(agent, hash, "EXAMPLE", agent.id)).rejects.toThrow("Owner required"); expect(mocks.append).not.toHaveBeenCalled();
    mocks.agent.mockRejectedValueOnce(new Error("Invalid agency agent")); await expect(assignSale(owner, hash, "EXAMPLE", agent.id)).rejects.toThrow("agency");
    await assignSale(owner, hash, "EXAMPLE", agent.id); expect(mocks.append).toHaveBeenCalledWith(owner, owner.id, hash, "EXAMPLE", { kind: "assignment", agentId: agent.id });
  });
});
