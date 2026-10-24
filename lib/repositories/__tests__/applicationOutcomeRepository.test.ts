import { beforeEach, describe, expect, it, vi } from "vitest";
import { readApplicationOutcomes, appendApplicationOutcome } from "../applicationOutcomeRepository";
import { applicationKey, applicationFingerprint } from "@/lib/enrollments/applicationOutcome";
import { syntheticSunfireCollection } from "@/lib/enrollments/__fixtures__/sunfireCollection";
import type { CurrentUser } from "@/types/domain";
const mocks = vi.hoisted(() => ({ source: vi.fn(), range: vi.fn(), insert: vi.fn(), eq: vi.fn() }));
vi.mock("../saleDispositionRepository", () => ({ readAuthorizedSaleSource: mocks.source }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: () => {
  const q = { select: () => q, eq: (...args: unknown[]) => { mocks.eq(...args); return q; }, order: () => q, range: mocks.range, insert: mocks.insert }; return q;
} }) }));
const source = syntheticSunfireCollection().records[0], hash = "a".repeat(64);
const user = { id: "agent", agencyId: "agency", role: "agent", active: true, firstName: "Example", lastName: "Agent" } as CurrentUser;
const event = { id: "old", created_at: "2026-10-23T12:00:00Z", details: { version: 1, ownerId: "owner", enrollmentCode: source.code, fingerprint: applicationFingerprint(source), actorName: "Example Agent", status: "did_not_take_effect", note: "Never took effect" } };
beforeEach(() => { vi.clearAllMocks(); mocks.source.mockResolvedValue(source); mocks.range.mockResolvedValue({ data: [], error: null }); mocks.insert.mockResolvedValue({ error: null }); });
describe("authorized append-only application outcomes", () => {
  it("blocks revoked, unassigned and cross-tenant references before any history access", async () => {
    mocks.source.mockRejectedValue(new Error("Sale is not assigned to you"));
    await expect(readApplicationOutcomes(user, "other-owner", hash, source.code)).rejects.toThrow("not assigned");
    await expect(appendApplicationOutcome(user, "owner", hash, source.code, "did_not_take_effect", "Explanation")).rejects.toThrow("not assigned");
    expect(mocks.range).not.toHaveBeenCalled(); expect(mocks.insert).not.toHaveBeenCalled();
  });
  it("scopes reads by agency and application key and preserves audit attribution", async () => {
    mocks.range.mockResolvedValue({ data: [event], error: null });
    const result = await readApplicationOutcomes(user, "owner", hash, source.code);
    expect(result.latest).toMatchObject({ actorName: "Example Agent", note: "Never took effect", recordedAt: event.created_at });
    expect(mocks.eq).toHaveBeenCalledWith("agency_id", user.agencyId);
    expect(mocks.eq).toHaveBeenCalledWith("entity_id", applicationKey(user.agencyId, "owner", source.code));
    expect(mocks.eq).not.toHaveBeenCalledWith("actor_user_id", user.id);
  });
  it("does not transfer a correction to changed application details", async () => {
    mocks.range.mockResolvedValue({ data: [event], error: null });
    mocks.source.mockResolvedValue({ ...source, proposedEffectiveDate: "2026-03-01" });
    expect((await readApplicationOutcomes(user, "owner", hash, source.code)).latest).toBeUndefined();
  });
  it("appends a retriable actor-attributed outcome, without MBI or financial writes", async () => {
    await appendApplicationOutcome(user, "owner", hash, source.code, "did_not_take_effect", " Did not take effect ");
    await appendApplicationOutcome(user, "owner", hash, source.code, "did_not_take_effect", " Did not take effect ");
    expect(mocks.insert.mock.calls[0][0]).toEqual(mocks.insert.mock.calls[1][0]);
    expect(mocks.insert.mock.calls[0][0]).toMatchObject({ actor_user_id: user.id, agency_id: user.agencyId, action: "sunfire.application_outcome_updated", details: { ownerId: "owner", enrollmentCode: source.code, note: "Did not take effect", actorName: "Example Agent" } });
    expect(JSON.stringify(mocks.insert.mock.calls)).not.toContain(source.mbi);
    mocks.insert.mockResolvedValue({ error: { code: "23505" } });
    await expect(appendApplicationOutcome(user, "owner", hash, source.code, "did_not_take_effect", "Explanation")).resolves.toBeUndefined();
  });
  it("rechecks assignment at save time and requires valid input", async () => {
    await expect(appendApplicationOutcome(user, "owner", hash, source.code, "did_not_take_effect", " ")).rejects.toThrow("explain");
    expect(mocks.source).not.toHaveBeenCalled();
    mocks.source.mockResolvedValueOnce(source).mockRejectedValueOnce(new Error("Assignment revoked"));
    await expect(appendApplicationOutcome(user, "owner", hash, source.code, "did_not_take_effect", "Explanation")).rejects.toThrow("revoked");
    expect(mocks.insert).not.toHaveBeenCalled();
  });
  it("keeps undo history and skips an unchanged duplicate outcome", async () => {
    mocks.range.mockResolvedValue({ data: [event], error: null });
    await appendApplicationOutcome(user, "owner", hash, source.code, "did_not_take_effect", event.details.note);
    expect(mocks.insert).not.toHaveBeenCalled();
    await appendApplicationOutcome(user, "owner", hash, source.code, "commission_expected", "Application did take effect");
    expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({ details: expect.objectContaining({ status: "commission_expected" }) }));
  });
});
