import type { ProductType } from "@/lib/reporting/productTypes";

export interface CarrierProductEvidence { code: ProductType; label: string; description: string }
/** Carrier product capability, not an agency commission rule. Confirmed by the user on 2026-10-21. */
export function productEvidenceForCarrier(carrier: string): CarrierProductEvidence | undefined {
  if (carrier !== "Ultimate Health Plans") return undefined;
  return { code: "MEDICARE_ADVANTAGE", label: "Medicare Advantage (MAPD)", description: "Confirmed carrier product mapping: MAPD. This is not an extracted PDF field." };
}