import { describe, expect, it } from "vitest";
import { normalizePayeeId } from "@/lib/carriers/payeeId";

describe("normalizePayeeId", () => {
  it("upper-cases and removes spaces", () => {
    expect(normalizePayeeId(" w 1234 ")).toBe("W1234");
  });

  it("treats empty input as no ID", () => {
    expect(normalizePayeeId("   ")).toBeNull();
    expect(normalizePayeeId("")).toBeNull();
    expect(normalizePayeeId(null)).toBeNull();
    expect(normalizePayeeId(undefined)).toBeNull();
  });
});
