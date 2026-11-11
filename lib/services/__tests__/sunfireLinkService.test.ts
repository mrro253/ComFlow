import { beforeEach, describe, expect, it, vi } from "vitest";
import { confirmSunfireLinks } from "../sunfireLinkService";
import { compareEnrollmentCommissions } from "@/lib/enrollments/commissionMatches";
import { linkPlan } from "@/lib/enrollments/confirmedLinks";
import { digest } from "@/lib/carriers/digest";
import { syntheticSunfireCollection } from "@/lib/enrollments/__fixtures__/sunfireCollection";
import type { CurrentUser } from "@/types/domain";
const mocks = vi.hoisted(() => ({ review: vi.fn(), read: vi.fn(), append: vi.fn() }));
vi.mock("../sunfireMatchService", () => ({ getSunfireMatches: mocks.review }));
vi.mock("@/lib/repositories/sunfireLinkRepository", () => ({ readConfirmedSunfireLinks: mocks.read, appendSunfireLinkConfirmation: mocks.append }));
const enrollment = { ...syntheticSunfireCollection().records[0], carrier: "Ultimate Health Plans" };
const matches = compareEnrollmentCommissions([enrollment], [{ entryId: "entry", statementId: "statement", carrier: enrollment.carrier, clientName: "Example Person", firstName: "Example", lastName: "Person", medicareId: enrollment.mbi.slice(-5), effectiveDate: enrollment.proposedEffectiveDate, statementMonth: "2026-02", category: "COMMISSION", amountCents: 10000, statementFilename: "synthetic.pdf" }], [enrollment.carrier]);
const user = { id: "owner", agencyId: "agency", active: true, role: "owner" } as CurrentUser;
const hash = "a".repeat(64), plan = linkPlan(matches);
beforeEach(() => { vi.clearAllMocks(); mocks.review.mockResolvedValue({ current: { hash }, matches }); mocks.read.mockResolvedValue([]); });
describe("confirming source-verified SunFire links", () => {
  it("rejects a changed preview before any write", async () => {
    await expect(confirmSunfireLinks(user, hash, "stale")).rejects.toThrow("changed"); expect(mocks.append).not.toHaveBeenCalled();
  });
  it("saves only current confirmed evidence and skips previously confirmed links", async () => {
    expect(await confirmSunfireLinks(user, hash, digest(plan))).toBe(1);
    expect(mocks.append).toHaveBeenCalledWith(user, hash, plan);
    mocks.read.mockResolvedValue(plan);
    expect(await confirmSunfireLinks(user, hash, digest(plan))).toBe(0);
    expect(mocks.append).toHaveBeenLastCalledWith(user, hash, []);
  });
  it("propagates unavailable source errors without writing", async () => {
    mocks.review.mockRejectedValue(new Error("Source unavailable"));
    await expect(confirmSunfireLinks(user, hash, digest(plan))).rejects.toThrow("Source unavailable"); expect(mocks.append).not.toHaveBeenCalled();
  });
});
