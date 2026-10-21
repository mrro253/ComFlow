import { productEvidenceForCarrier } from "@/lib/carriers/productEvidence";
import { describe, expect, it } from "vitest";
import { classifyReportedProduct, PRODUCT_TYPES } from "../productTypes";
const field = (value: string, label = "Product type") => [{ label, value }];
describe("reported product types", () => {
  it.each([
    ["Dental", "DENTAL"], ["Vision", "VISION"], ["Hearing", "HEARING"],
    ["DVH", "DENTAL_VISION_HEARING"], ["dental / vision / hearing", "DENTAL_VISION_HEARING"],
    ["MAPD", "MEDICARE_ADVANTAGE"], ["MA-PD", "MEDICARE_ADVANTAGE"], ["Medicare Advantage", "MEDICARE_ADVANTAGE"],
    ["PDP", "PRESCRIPTION_DRUG"], ["Medicare Part D", "PRESCRIPTION_DRUG"],
    ["Medigap", "MEDICARE_SUPPLEMENT"], ["Medicare supplement", "MEDICARE_SUPPLEMENT"],
    ["Life insurance", "LIFE"], ["Whole life", "LIFE"], ["Final expense", "FINAL_EXPENSE"],
    ["Indexed annuity", "ANNUITY"],
  ])("classifies an explicit %s field as %s", (value, code) => {
    const result = classifyReportedProduct(field(value));
    expect(result.code).toBe(code); expect(result.reportedValue).toBe(value);
  });
  it("does not infer a product from carrier, notes, prior plan, payment category or amount", () => {
    expect(classifyReportedProduct([
      { label: "Carrier", value: "Ultimate Health Plans" }, { label: "Prior Plan", value: "Medigap" },
      { label: "Notes", value: "MAPD" }, { label: "Type", value: "RENEWAL" }, { label: "Amount", value: "300.00" },
    ]).code).toBe("UNKNOWN");
  });
  it("distinguishes unreported products from a different explicitly reported product", () => {
    expect(classifyReportedProduct(null).code).toBe("UNKNOWN");
    expect(classifyReportedProduct(field("Accident insurance"))).toMatchObject({ code: "OTHER", reportedValue: "Accident insurance" });
  });
  it("treats empty placeholders as missing rather than a product", () => {
    for (const placeholder of ["", "-", "N/A", "Unknown", "Not provided"]) expect(classifyReportedProduct(field(placeholder)).code).toBe("UNKNOWN");
  });
  it("rejects conflicting fields without guessing and accepts equivalent labels", () => {
    expect(classifyReportedProduct([...field("Dental"), ...field("Vision", "Line of business")]).code).toBe("UNKNOWN");
    expect(classifyReportedProduct([...field("Cancer"), ...field("Accident", "Product")]).code).toBe("UNKNOWN");
    expect(classifyReportedProduct([...field("MAPD"), ...field("Medicare Advantage", "Product")]).code).toBe("MEDICARE_ADVANTAGE");
  });
  it("includes separate bundle, final-expense, other and unknown options", () => {
    expect(new Set(PRODUCT_TYPES.map((type) => type.code)).size).toBe(PRODUCT_TYPES.length);
    expect(PRODUCT_TYPES.map((type) => type.code)).toEqual(expect.arrayContaining(["DENTAL_VISION_HEARING", "LIFE", "FINAL_EXPENSE", "OTHER", "UNKNOWN"]));
  });
  it("labels Ultimate MAPD from confirmed carrier evidence, not a fabricated statement field", () => {
    const result = classifyReportedProduct([], productEvidenceForCarrier("Ultimate Health Plans"));
    expect(result).toMatchObject({ code: "MEDICARE_ADVANTAGE", label: "Medicare Advantage (MAPD)", basis: "carrier", reportedValue: null });
    expect(result.reason).toContain("not an extracted PDF field");
  });
  it("does not apply Ultimate's mapping to other or lookalike carriers", () => {
    for (const carrier of ["Other Carrier", "Ultimate Health Plans Dental", ""]) {
      expect(classifyReportedProduct([], productEvidenceForCarrier(carrier)).code).toBe("UNKNOWN");
    }
  });
  it("holds contradictions for review rather than overriding the statement or carrier evidence", () => {
    const evidence = productEvidenceForCarrier("Ultimate Health Plans");
    expect(classifyReportedProduct(field("Dental"), evidence).code).toBe("UNKNOWN");
    expect(classifyReportedProduct(field("MAPD"), evidence)).toMatchObject({ code: "MEDICARE_ADVANTAGE", basis: "statement", reportedValue: "MAPD" });
  });});