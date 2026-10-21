/** Reporting labels only: never use these groups to select compensation rules or rates. */
export const PRODUCT_TYPES = [
  { code: "DENTAL", label: "Dental" },
  { code: "VISION", label: "Vision" },
  { code: "HEARING", label: "Hearing" },
  { code: "DENTAL_VISION_HEARING", label: "Dental / Vision / Hearing bundle" },
  { code: "MEDICARE_ADVANTAGE", label: "Medicare Advantage" },
  { code: "PRESCRIPTION_DRUG", label: "Prescription drug" },
  { code: "MEDICARE_SUPPLEMENT", label: "Medicare supplement" },
  { code: "LIFE", label: "Life insurance" },
  { code: "FINAL_EXPENSE", label: "Final expense" },
  { code: "ANNUITY", label: "Annuity" },
  { code: "OTHER", label: "Other (as reported)" },
  { code: "UNKNOWN", label: "Unknown" },
] as const;
export type ProductType = typeof PRODUCT_TYPES[number]["code"];
export interface ProductClassification {
  code: ProductType; label: string; reportedValue: string | null; reason: string | null; basis: "statement" | "carrier" | "unknown";
}
const key = (text: string) => text.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_|_$/g, "");
const ALIASES: Readonly<Record<string, ProductType>> = {
  DENTAL: "DENTAL", DENTAL_INSURANCE: "DENTAL", VISION: "VISION", VISION_INSURANCE: "VISION",
  HEARING: "HEARING", HEARING_INSURANCE: "HEARING", DVH: "DENTAL_VISION_HEARING", DENTAL_VISION_HEARING: "DENTAL_VISION_HEARING",
  MA: "MEDICARE_ADVANTAGE", MAPD: "MEDICARE_ADVANTAGE", MA_PD: "MEDICARE_ADVANTAGE", MEDICARE_ADVANTAGE: "MEDICARE_ADVANTAGE",
  PDP: "PRESCRIPTION_DRUG", PART_D: "PRESCRIPTION_DRUG", MEDICARE_PART_D: "PRESCRIPTION_DRUG", PRESCRIPTION_DRUG: "PRESCRIPTION_DRUG", PRESCRIPTION_DRUG_PLAN: "PRESCRIPTION_DRUG",
  MEDIGAP: "MEDICARE_SUPPLEMENT", MED_SUPP: "MEDICARE_SUPPLEMENT", MEDICARE_SUPPLEMENT: "MEDICARE_SUPPLEMENT", MEDICARE_SUPPLEMENT_INSURANCE: "MEDICARE_SUPPLEMENT",
  LIFE: "LIFE", LIFE_INSURANCE: "LIFE", TERM_LIFE: "LIFE", WHOLE_LIFE: "LIFE", UNIVERSAL_LIFE: "LIFE",
  FINAL_EXPENSE: "FINAL_EXPENSE", FINAL_EXPENSE_INSURANCE: "FINAL_EXPENSE", FINAL_EXPENSE_LIFE_INSURANCE: "FINAL_EXPENSE",
  ANNUITY: "ANNUITY", ANNUITIES: "ANNUITY", FIXED_ANNUITY: "ANNUITY", VARIABLE_ANNUITY: "ANNUITY", INDEXED_ANNUITY: "ANNUITY",
};
const FIELDS = new Set(["PRODUCT", "PRODUCT_TYPE", "PRODUCT_CATEGORY", "LINE_OF_BUSINESS"]);
const EMPTY = new Set(["", "UNKNOWN", "NOT_PROVIDED", "NOT_CONFIGURED", "N_A"]);
export function classifyReportedProduct(fields?: readonly { label: string; value: string }[] | null,
  confirmedCarrierProduct?: { code: ProductType; label: string; description: string }): ProductClassification {
  const stated = (fields ?? []).filter((field) => FIELDS.has(key(field.label)) && !EMPTY.has(key(field.value)));
  const unknown = (reason: string): ProductClassification => ({ code: "UNKNOWN", label: "Unknown", reportedValue: null, reason, basis: "unknown" });
  if (!stated.length) return confirmedCarrierProduct
    ? { code: confirmedCarrierProduct.code, label: confirmedCarrierProduct.label, reportedValue: null, reason: confirmedCarrierProduct.description, basis: "carrier" }
    : unknown("No verified statement field or confirmed carrier product mapping is available.");
  const codes = new Set(stated.map((field) => ALIASES[key(field.value)] ?? "OTHER"));
  if (codes.size !== 1 || (codes.has("OTHER") && new Set(stated.map((field) => key(field.value))).size !== 1)) {
    return unknown("Conflicting product fields need review.");
  }
  const code = [...codes][0];
  if (confirmedCarrierProduct && code !== confirmedCarrierProduct.code) return unknown("The statement product conflicts with the confirmed carrier mapping and needs review.");
  return { code, label: PRODUCT_TYPES.find((type) => type.code === code)!.label, reportedValue: stated[0].value.trim(), reason: null, basis: "statement" };
}