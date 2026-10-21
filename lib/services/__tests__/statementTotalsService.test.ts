import { beforeEach, expect, it, vi } from "vitest";
import { loadStatementTotalsCheck, loadStatementTotalsOverview } from "../statementTotalsService";
import type { CurrentUser } from "@/types/domain";
const mocks = vi.hoisted(() => ({ statement: vi.fn(), coverage: vi.fn(), amounts: vi.fn() }));
vi.mock("@/lib/repositories/statementRepository", () => ({ getStatement: mocks.statement, listStatementCoverage: mocks.coverage }));
vi.mock("@/lib/repositories/statementTotalsRepository", () => ({ listStatementAmounts: mocks.amounts }));
const user = { id: "owner", role: "owner", agencyId: "agency" } as CurrentUser;
const statement = { id: "statement", userId: "agent", carrier: "Example", statementMonth: "2026-01", status: "imported", statementTotalCents: 1500, carriedBalanceCents: 100, transactionCount: 2, supersededAt: null };
beforeEach(() => { vi.resetAllMocks(); mocks.statement.mockResolvedValue(statement); mocks.coverage.mockResolvedValue([statement]); mocks.amounts.mockResolvedValue([1000, 400]); });
it("checks session-visible imported statements using actual row amounts", async () => {
  expect((await loadStatementTotalsCheck(user, statement.id))?.check.status).toBe("match");
  expect(mocks.amounts).toHaveBeenCalledWith(statement.id, user.agencyId);
});
it("never reads amounts for hidden or unauthorized statements", async () => {
  mocks.statement.mockResolvedValue(null);
  expect(await loadStatementTotalsCheck(user, "hidden")).toBeNull();
  mocks.statement.mockResolvedValue(statement);
  expect(await loadStatementTotalsCheck({ ...user, id: "another", role: "agent", agentType: "independent", independentOwner: true }, statement.id)).toBeNull();
  expect(mocks.amounts).not.toHaveBeenCalled();
});
it("does not parse or change pending statements", async () => {
  mocks.statement.mockResolvedValue({ ...statement, status: "received" });
  expect(await loadStatementTotalsCheck(user, statement.id)).toBeNull();
  expect(mocks.amounts).not.toHaveBeenCalled();
});
it("reports read failures as unavailable, not matches", async () => {
  mocks.amounts.mockRejectedValue(new Error("private read error"));
  expect((await loadStatementTotalsCheck(user, statement.id))?.check).toMatchObject({ status: "unavailable", importedCents: null });
});
it("allows explicit historical checks but excludes replaced/pending/inaccessible sources from the overview", async () => {
  mocks.statement.mockResolvedValue({ ...statement, status: "superseded" });
  expect((await loadStatementTotalsCheck(user, statement.id))?.check.status).toBe("match");
  mocks.coverage.mockResolvedValue([statement, { ...statement, id: "old", status: "superseded" }, { ...statement, id: "pending", status: "received" }]);
  expect(await loadStatementTotalsOverview(user)).toHaveLength(1);
});
