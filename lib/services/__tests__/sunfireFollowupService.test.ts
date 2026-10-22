import { beforeEach, describe, expect, it, vi } from "vitest";
import { recordEnrollmentNotEffective } from "../sunfireFollowupService";
import { noCommissionExpected, type SunfireFollowup } from "@/lib/enrollments/followup";
import type { EnrollmentCommissionMatch } from "@/lib/enrollments/commissionMatches";
import type { CurrentUser } from "@/types/domain";
const mocks = vi.hoisted(() => ({ review: vi.fn(), append: vi.fn() }));
vi.mock("../sunfireMatchService", () => ({ getSunfireMatches: mocks.review }));
vi.mock("@/lib/repositories/sunfireFollowupRepository", () => ({ appendSunfireFollowup: mocks.append }));
const user = { id: "owner", agencyId: "agency", role: "owner", active: true } as CurrentUser;
const match = { enrollmentCode: "EXAMPLE", evidence: [] } as unknown as EnrollmentCommissionMatch;
const note: SunfireFollowup = { enrollmentCode: "EXAMPLE", status: "did_not_take_effect", note: "The policy did not take effect; no commission was received.", recordedAt: "2026-10-22T12:00:00Z" };
beforeEach(() => { vi.clearAllMocks(); mocks.review.mockResolvedValue({ current: { hash: "a".repeat(64) }, matches: [match] }); });
describe("owner-reported enrollment not effective", () => {
  it("requires an active owner before reading or writing", async () => {
    await expect(recordEnrollmentNotEffective({ ...user, active: false }, "a".repeat(64), "EXAMPLE", note.note)).rejects.toThrow("owner");
    await expect(recordEnrollmentNotEffective({ ...user, role: "agent" }, "a".repeat(64), "EXAMPLE", note.note)).rejects.toThrow("owner");
    expect(mocks.review).not.toHaveBeenCalled(); expect(mocks.append).not.toHaveBeenCalled();
  });
  it("verifies the collection and enrollment and preserves the explanation", async () => {
    await recordEnrollmentNotEffective(user, "a".repeat(64), "EXAMPLE", `  ${note.note}  `);
    expect(mocks.append).toHaveBeenCalledWith(user, "a".repeat(64), "EXAMPLE", note.note);
    await expect(recordEnrollmentNotEffective(user, "a".repeat(64), "OTHER", note.note)).rejects.toThrow("not found");
    expect(mocks.append).toHaveBeenCalledTimes(1);
  });
  it("does not close an enrollment with existing statement evidence", async () => {
    mocks.review.mockResolvedValue({ current: { hash: "a".repeat(64) }, matches: [{ ...match, evidence: [{}] }] });
    await expect(recordEnrollmentNotEffective(user, "a".repeat(64), "EXAMPLE", note.note)).rejects.toThrow("Statement evidence");
    expect(mocks.append).not.toHaveBeenCalled();
  });
  it("reopens follow-up when evidence appears and never applies another enrollment's note", () => {
    expect(noCommissionExpected(match, note)).toBe(true);
    expect(noCommissionExpected(match)).toBe(false);
    expect(noCommissionExpected({ ...match, enrollmentCode: "OTHER" }, note)).toBe(false);
    expect(noCommissionExpected({ ...match, evidence: [{}] } as EnrollmentCommissionMatch, note)).toBe(false);
  });
});
