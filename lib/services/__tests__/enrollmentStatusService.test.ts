import { beforeEach, describe, expect, it, vi } from "vitest";
import { listEnrollmentStatuses } from "../enrollmentStatusService";
import { compareEnrollmentCommissions, type CommissionEvidence } from "@/lib/enrollments/commissionMatches";
import { syntheticSunfireCollection } from "@/lib/enrollments/__fixtures__/sunfireCollection";
import type { CurrentUser } from "@/types/domain";
const mocks = vi.hoisted(() => ({ sales: vi.fn(), compare: vi.fn(), followups: vi.fn(), assigned: vi.fn(), outcomes: vi.fn() }));
vi.mock("@/lib/repositories/applicationOutcomeRepository", () => ({ readApplicationOutcomes: mocks.outcomes }));
vi.mock("../saleDispositionService", () => ({ listEditableSales: mocks.sales }));
vi.mock("../sunfireMatchService", () => ({ compareVerifiedEnrollments: mocks.compare }));
vi.mock("@/lib/repositories/sunfireFollowupRepository", () => ({ readSunfireFollowups: mocks.followups, readAssignedSaleFollowup: mocks.assigned }));
const source = syntheticSunfireCollection().records[0];
const user = { id: "owner", agencyId: "agency", active: true, role: "owner" } as CurrentUser;
const sale = { source, ownerId: "owner", collectionHash: "a".repeat(64), code: source.code, clientName: "Example Person", disposition: null };
const match = (entries: CommissionEvidence[] = []) => ({ matches: compareEnrollmentCommissions([source], entries, []) });
beforeEach(() => { vi.clearAllMocks(); mocks.sales.mockResolvedValue([sale]); mocks.compare.mockResolvedValue(match()); mocks.followups.mockResolvedValue({}); mocks.assigned.mockResolvedValue(undefined); mocks.outcomes.mockResolvedValue({ history: [], latest: undefined }); });
describe("derived enrollment status service", () => {
  it("compares only authorized sources and strips full MBIs from the view model", async () => {
    const rows = await listEnrollmentStatuses(user);
    expect(mocks.sales).toHaveBeenCalledWith(user, undefined, true);
    expect(mocks.compare).toHaveBeenCalledWith(user, [source]);
    expect(rows[0].commission.label).toBe("Not paid yet");
    expect(JSON.stringify(rows)).not.toContain(source.mbi);
  });
  it("retains application-specific no-commission decisions even when later evidence appears", async () => {
    mocks.outcomes.mockResolvedValue({ history: [{ id: "event", status: "did_not_take_effect", note: "Original application never started", actorName: "Example Agent", recordedAt: "2026-10-23", fingerprint: "private" }], latest: { status: "did_not_take_effect", note: "Original application never started" } });
    const rows = await listEnrollmentStatuses(user);
    expect(rows[0].commission.label).toBe("No commission expected");
    expect(rows[0].explanation).toBe("Original application never started");
    expect(rows[0].outcomeHistory[0]).not.toHaveProperty("fingerprint");
  });
  it("does not erase an existing did-not-take-effect explanation when a later statement candidate appears", async () => {
    mocks.followups.mockResolvedValue({ [source.code]: { enrollmentCode: source.code, status: "did_not_take_effect", note: "Original never took effect" } });
    const row: CommissionEvidence = { entryId: "payment", statementId: "statement", carrier: source.carrier, clientName: "Example Person", firstName: source.firstName, lastName: source.lastName, medicareId: source.mbi, effectiveDate: source.proposedEffectiveDate, statementMonth: "2026-02", category: "COMMISSION", amountCents: 10000, statementFilename: "synthetic.pdf" };
    mocks.compare.mockResolvedValue(match([row]));
    expect((await listEnrollmentStatuses(user))[0].commission.label).toBe("No commission expected");
  });
  it("allows an explicit undo to supersede an older no-commission explanation", async () => {
    mocks.followups.mockResolvedValue({ [source.code]: { enrollmentCode: source.code, status: "did_not_take_effect", note: "Old explanation" } });
    mocks.outcomes.mockResolvedValue({ history: [], latest: { status: "commission_expected", note: "Correction" } });
    expect((await listEnrollmentStatuses(user))[0].commission.label).toBe("Not paid yet");
  });
  it("does not fabricate unpaid statuses when sources cannot be checked", async () => {
    mocks.compare.mockRejectedValue(new Error("Source unavailable"));
    await expect(listEnrollmentStatuses(user)).rejects.toThrow("Source unavailable");
  });
  it("does not load commission details for a user with no assigned enrollments", async () => {
    mocks.sales.mockResolvedValue([]);
    expect(await listEnrollmentStatuses({ ...user, role: "agent" })).toEqual([]);
    expect(mocks.compare).not.toHaveBeenCalled();
  });
  it("preserves no commission expected and reads an agent's explanation only through the assignment guard", async () => {
    const note = { enrollmentCode: source.code, status: "did_not_take_effect", note: "Did not take effect" };
    mocks.followups.mockResolvedValue({ [source.code]: note });
    expect((await listEnrollmentStatuses(user))[0].commission.label).toBe("No commission expected");
    mocks.assigned.mockResolvedValue(note);
    const agent = { ...user, id: "agent", role: "agent" } as CurrentUser;
    expect((await listEnrollmentStatuses(agent))[0].explanation).toBe(note.note);
    expect(mocks.assigned).toHaveBeenCalledWith(agent, sale.ownerId, sale.collectionHash, source.code);
    expect(mocks.followups).toHaveBeenCalledTimes(1);
  });
});
