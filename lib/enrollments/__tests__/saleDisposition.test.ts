import { describe, expect, it } from "vitest";
import { validateDisposition, saleAssignment, latestSaleDisposition, saleHistory, type SaleEvent } from "../saleDisposition";
const base = { id: "1", actorId: "owner", actorName: "Example Owner", ownerId: "owner", collectionHash: "a".repeat(64), enrollmentCode: "EXAMPLE", recordedAt: "2026-10-22T12:00:00Z" };
describe("manual policy dispositions and assignments", () => {
  it("accepts exactly the GHL statuses and requires a bounded note", () => {
    for (const status of ["Active", "Inactive", "Future Active", "Unknown"]) expect(validateDisposition(status, " Explanation ")).toEqual({ status, note: "Explanation" });
    for (const status of ["Pending", "Cancelled", "Paid", "active"]) expect(() => validateDisposition(status, "Explanation")).toThrow();
    expect(() => validateDisposition("Active", " ")).toThrow(); expect(() => validateDisposition("Unknown", "x".repeat(2001))).toThrow();
  });
  it("uses the latest assignment, including revocation, without crossing sale or owner scopes", () => {
    const assigned: SaleEvent = { ...base, kind: "assignment", agentId: "agent" };
    const removed: SaleEvent = { ...base, id: "2", recordedAt: "2026-10-22T13:00:00Z", kind: "assignment", agentId: null };
    expect(saleAssignment([assigned], "owner", base.collectionHash, "EXAMPLE")).toBe("agent");
    expect(saleAssignment([assigned, removed], "owner", base.collectionHash, "EXAMPLE")).toBe(null);
    expect(saleAssignment([assigned], "other", base.collectionHash, "EXAMPLE")).toBe(null);
    expect(saleAssignment([assigned], "owner", "b".repeat(64), "EXAMPLE")).toBe(null);
  });
  it("retains disposition history independently of assignments and financial outcomes", () => {
    const inactive: SaleEvent = { ...base, kind: "disposition", status: "Inactive", note: "The sale did not take effect." };
    const active: SaleEvent = { ...base, id: "2", recordedAt: "2026-10-22T13:00:00Z", kind: "disposition", status: "Active", note: "Correction confirmed by agent." };
    expect(latestSaleDisposition([inactive, active], "owner", base.collectionHash, "EXAMPLE")?.status).toBe("Active");
    expect(saleHistory([active, inactive], "owner", base.collectionHash, "EXAMPLE")).toEqual([active, inactive]);
    expect(active).not.toHaveProperty("amountCents"); expect(active).not.toHaveProperty("commissionExpected");
  });
});
