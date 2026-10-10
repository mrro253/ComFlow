import { formatCents } from "@/lib/carriers/money";

/**
 * Pure rules for the Owner-editable compensation settings. No I/O.
 *
 * History is never rewritten: "changing" a rate adds a new rule that starts on a
 * later date and closes the previous open rule the day before. Missing rates stay
 * NOT_CONFIGURED (they are simply absent here), never zero.
 */

export interface RuleRow {
  id: string;
  careerLevel: string | null;
  product: string;
  commissionType: string;
  calculationMethod: "FIXED" | "PERCENT";
  rateCents: number | null;
  ratePercent: number | null;
  percentBasis: "ANNUAL_PREMIUM" | null;
  status: "ACTIVE" | "NOT_CONFIGURED";
  effectiveFrom: string;
  effectiveTo: string | null;
}

export interface NewRuleInput {
  careerLevel: string;
  product: string;
  commissionType: string;
  method: "FIXED" | "PERCENT";
  /** Integer cents, for FIXED rules. */
  rateCents: number | null;
  /** Whole or fractional percentage points (75 means 75%), for PERCENT rules. */
  ratePercent: number | null;
  effectiveFrom: string;
}

export interface NewRule {
  careerLevel: string;
  product: string;
  commissionType: string;
  calculationMethod: "FIXED" | "PERCENT";
  rateCents: number | null;
  ratePercent: number | null;
  percentBasis: "ANNUAL_PREMIUM" | null;
  effectiveFrom: string;
}

export type RuleChangePlan =
  | { ok: true; close: { id: string; effectiveTo: string }[]; insert: NewRule }
  | { ok: false; error: string };

/** "final expense" -> "FINAL_EXPENSE". Products and payment categories are stored in this form. */
export function normalizeCode(raw: string): string {
  return raw
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/** "300", "$1,200", "12.5" -> cents. Null when it is not a plain non-negative dollar amount. */
export function parseDollarsToCents(raw: string): number | null {
  const cleaned = raw.trim().replace(/^\$/, "").replace(/,/g, "");
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(cleaned);
  if (!match) return null;
  const cents = Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0") || "0");
  return Number.isSafeInteger(cents) ? cents : null;
}

/** "75", "12.5%" -> percentage points between 0 and 100 (up to 4 decimals). Null otherwise. */
export function parsePercent(raw: string): number | null {
  const cleaned = raw.trim().replace(/%$/, "").trim();
  if (!/^\d+(\.\d{1,4})?$/.test(cleaned)) return null;
  const value = Number(cleaned);
  return value >= 0 && value <= 100 ? value : null;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** The day before an ISO date (UTC, so no timezone drift). */
export function dayBefore(iso: string): string {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

/**
 * Validates a new rate and works out which open rules it replaces.
 * A new rate must start after every existing rate for the same level, product and
 * category (no back-dating), and closes whatever was open at its start date.
 */
export function planRuleChange(
  existing: readonly RuleRow[],
  input: NewRuleInput,
  activeLevels: readonly string[]
): RuleChangePlan {
  const product = normalizeCode(input.product);
  const commissionType = normalizeCode(input.commissionType);
  if (!product) return { ok: false, error: "Enter a product (for example MAPD)." };
  if (!commissionType) return { ok: false, error: "Enter a payment category (for example T65 or RENEWAL)." };
  if (product.length > 40 || commissionType.length > 40) return { ok: false, error: "Product and category names are too long." };
  if (!activeLevels.includes(input.careerLevel)) return { ok: false, error: "Choose one of your career levels." };
  if (!isIsoDate(input.effectiveFrom)) return { ok: false, error: "Enter a valid start date." };

  if (input.method === "FIXED") {
    if (input.rateCents === null || !Number.isSafeInteger(input.rateCents) || input.rateCents < 0) {
      return { ok: false, error: "Enter a dollar amount, for example 300 or 12.50." };
    }
  } else if (input.ratePercent === null || input.ratePercent < 0 || input.ratePercent > 100) {
    return { ok: false, error: "Enter a percentage between 0 and 100." };
  }

  const sameKey = existing.filter(
    (rule) =>
      rule.careerLevel === input.careerLevel &&
      rule.product === product &&
      rule.commissionType === commissionType
  );

  if (sameKey.some((rule) => rule.effectiveFrom >= input.effectiveFrom)) {
    return {
      ok: false,
      error: "A rate for this level, product and category already starts on or after that date. Choose a later start date.",
    };
  }

  const close = sameKey
    .filter((rule) => rule.effectiveTo === null || rule.effectiveTo >= input.effectiveFrom)
    .map((rule) => ({ id: rule.id, effectiveTo: dayBefore(input.effectiveFrom) }));

  return {
    ok: true,
    close,
    insert: {
      careerLevel: input.careerLevel,
      product,
      commissionType,
      calculationMethod: input.method,
      rateCents: input.method === "FIXED" ? input.rateCents : null,
      ratePercent: input.method === "PERCENT" ? input.ratePercent : null,
      percentBasis: input.method === "PERCENT" ? "ANNUAL_PREMIUM" : null,
      effectiveFrom: input.effectiveFrom,
    },
  };
}

/** "$300.00", or "75% of annual premium". */
export function describeRate(rule: Pick<RuleRow, "calculationMethod" | "rateCents" | "ratePercent" | "percentBasis" | "status">): string {
  if (rule.status === "NOT_CONFIGURED") return "Not configured";
  if (rule.calculationMethod === "FIXED") return rule.rateCents === null ? "Not configured" : formatCents(rule.rateCents);
  if (rule.ratePercent === null) return "Not configured";
  const basis = rule.percentBasis === "ANNUAL_PREMIUM" ? " of annual premium" : "";
  return `${rule.ratePercent}%${basis}`;
}

export type RuleTiming = "current" | "upcoming" | "ended";

export function ruleTiming(rule: Pick<RuleRow, "effectiveFrom" | "effectiveTo">, today: string): RuleTiming {
  if (rule.effectiveFrom > today) return "upcoming";
  if (rule.effectiveTo !== null && rule.effectiveTo < today) return "ended";
  return "current";
}

/** Rules that are in effect today or start later, grouped for display by level order. */
export function currentRules(
  rules: readonly RuleRow[],
  today: string,
  levelOrder: readonly string[]
): RuleRow[] {
  const rank = (level: string | null) => {
    const index = level === null ? -1 : levelOrder.indexOf(level);
    return index === -1 ? levelOrder.length : index;
  };
  return rules
    .filter((rule) => ruleTiming(rule, today) !== "ended")
    .sort(
      (a, b) =>
        a.product.localeCompare(b.product) ||
        rank(a.careerLevel) - rank(b.careerLevel) ||
        a.commissionType.localeCompare(b.commissionType) ||
        a.effectiveFrom.localeCompare(b.effectiveFrom)
    );
}
