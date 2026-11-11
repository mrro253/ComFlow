import { describe, expect, it, vi } from "vitest";
import { getSunfireReview } from "../sunfireCollectionService";
import { syntheticSunfireCollection } from "@/lib/enrollments/__fixtures__/sunfireCollection";
import type { CurrentUser } from "@/types/domain";
vi.mock("@/lib/repositories/sunfireCollectionRepository", () => ({ listSunfireCollections: async () => [{ hash: "a".repeat(64), collectedAt: "2026-10-21T12:00:00Z" }], readSunfireCollection: async () => syntheticSunfireCollection() }));
describe("SunFire enrollment review", () => {
  it("keeps full identifiers out of the browser model", async () => {
    const review = await getSunfireReview({} as CurrentUser);
    expect(review.rows[0].mbiDisplay).toBe("•••••••MK73");
    expect(JSON.stringify(review)).not.toContain(syntheticSunfireCollection().records[0].mbi);
    expect(review.rows[0].coverageConfirmed).toBe(false);
  });
  it("rejects a selected collection outside the owner's recent list", async () => {
    await expect(getSunfireReview({} as CurrentUser, "b".repeat(64))).rejects.toThrow("not found");
  });
});
