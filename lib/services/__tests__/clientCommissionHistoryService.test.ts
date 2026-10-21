import { beforeEach, expect, it, vi } from "vitest";
import { loadClientCommissionHistory } from "../clientCommissionHistoryService";
import type { CurrentUser } from "@/types/domain";
import type { CarrierTransactionRecord } from "@/lib/repositories/statementRepository";
const mocks = vi.hoisted(() => ({ visible: vi.fn() }));
vi.mock("@/lib/repositories/statementRepository", () => ({ listVisibleTransactions: mocks.visible }));
const row: CarrierTransactionRecord = { id: "visible", statementId: "statement", carrier: "Example", statementMonth: "2026-01", memberId: "SYN001", effectiveDate: "2026-01-01", amountCents: 500, commissionType: "RENEWAL", writingAgentName: null, writingAgentVerified: false, userId: "agent", writingUserId: null };
beforeEach(() => { vi.resetAllMocks(); mocks.visible.mockResolvedValue([row]); });
it("returns nothing for an inaccessible seed and refreshes session visibility on every request", async () => {
  const user = { id: "agent", role: "agent", agencyId: "agency" } as CurrentUser;
  expect(await loadClientCommissionHistory(user, "hidden")).toBeNull();
  expect((await loadClientCommissionHistory(user, "visible"))?.count).toBe(1);
  mocks.visible.mockResolvedValue([]);
  expect(await loadClientCommissionHistory(user, "visible", 2)).toBeNull();
  expect(mocks.visible).toHaveBeenCalledTimes(3);
});
it("returns only history fields, with source links restricted by statement access", async () => {
  const agent = { id: "agent", role: "agent", agencyId: "agency", agentType: "career", independentOwner: false } as CurrentUser;
  const data = await loadClientCommissionHistory(agent, "visible");
  expect(data?.rows[0]).toEqual({ id: "visible", statementId: "statement", statementMonth: "2026-01", effectiveDate: "2026-01-01", category: "RENEWAL", cents: 500, canViewStatement: false });
  expect((await loadClientCommissionHistory({ ...agent, role: "owner" }, "visible"))?.rows[0].canViewStatement).toBe(true);
  expect((await loadClientCommissionHistory({ ...agent, agentType: "independent", independentOwner: true }, "visible"))?.rows[0].canViewStatement).toBe(true);
});
it("fails visibly when the repository cannot return a complete result", async () => {
  mocks.visible.mockRejectedValue(new Error("Read failed"));
  await expect(loadClientCommissionHistory({} as CurrentUser, "visible")).rejects.toThrow("Read failed");
});
