import { beforeEach, describe, expect, it, vi } from "vitest";
import { getSunfireMatches } from "../sunfireMatchService";
import { syntheticSunfireCollection } from "@/lib/enrollments/__fixtures__/sunfireCollection";
import type { CurrentUser } from "@/types/domain";
const mocks = vi.hoisted(() => ({ list: vi.fn(), read: vi.fn(), inventory: vi.fn(), details: vi.fn() }));
vi.mock("@/lib/repositories/sunfireCollectionRepository", () => ({ listSunfireCollections: mocks.list, readSunfireCollection: mocks.read }));
vi.mock("@/lib/repositories/sunfireMatchRepository", () => ({ loadSunfireMatchInventory: mocks.inventory }));
vi.mock("@/lib/services/paymentDetailsService", () => ({ loadPaymentDetails: mocks.details }));
const source = syntheticSunfireCollection(); source.records[0].carrier = "Ultimate Health Plans";
const user = { id: source.userId, agencyId: source.agencyId, role: "owner", active: true } as CurrentUser;
const inventory = { statements: [{ id: "statement", carrier: "Ultimate Health Plans" }], entries: [{ id: "entry", statement_id: "statement", carrier: "Ultimate Health Plans", effective_date: "2026-02-01", statement_month: "2026-02", commission_type: "COMMISSION", amount_cents: 10000 }] };
beforeEach(() => {
  vi.clearAllMocks(); mocks.list.mockResolvedValue([{ hash: "a".repeat(64) }]); mocks.read.mockResolvedValue(source); mocks.inventory.mockResolvedValue(inventory);
  mocks.details.mockResolvedValue(new Map([["entry", { clientName: "Example Person", statementFilename: "synthetic.pdf", fields: [{ label: "First Name", value: "Example" }, { label: "Last Name", value: "Person" }, { label: "MBI #", value: source.records[0].mbi.slice(-5) }] }]]));
});
describe("SunFire match review service", () => {
  it("denies nonowners and inactive users before loading any private sources", async () => {
    await expect(getSunfireMatches({ ...user, role: "agent" })).rejects.toThrow("owner");
    await expect(getSunfireMatches({ ...user, active: false })).rejects.toThrow("owner"); expect(mocks.list).not.toHaveBeenCalled();
  });
  it("builds masked review data using only source-verified entries", async () => {
    const review = await getSunfireMatches(user); expect(review.matches[0].status).toBe("strong");
    expect(mocks.details).toHaveBeenCalledWith(["entry"], user.agencyId); expect(mocks.inventory).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(review)).not.toContain(source.records[0].mbi);
  });
  it("holds the whole comparison if a source cannot be verified", async () => {
    mocks.details.mockResolvedValue(new Map()); await expect(getSunfireMatches(user)).rejects.toThrow("could not be verified");
  });
  it("rejects another collection and detects concurrent corrections", async () => {
    await expect(getSunfireMatches(user, "b".repeat(64))).rejects.toThrow("not found"); expect(mocks.inventory).not.toHaveBeenCalled();
    mocks.inventory.mockResolvedValueOnce(inventory).mockResolvedValueOnce({ ...inventory, entries: [] });
    await expect(getSunfireMatches(user)).rejects.toThrow("changed during");
  });
});
