import { describe, expect, it } from "vitest";
import {
  currentRules,
  dayBefore,
  describeRate,
  isIsoDate,
  normalizeCode,
  parseDollarsToCents,
  parsePercent,
  planRuleChange,
  ruleTiming,
  type NewRuleInput,
  type RuleRow,
} from "@/lib/carriers/compensation/ruleSettings";
import { activeLevelNames, normalizeLevelName, planNewLevel } from "@/lib/carriers/careerLevels";

const LEVELS = ["Associate", "Senior"];

const rule = (overrides: Partial<RuleRow> = {}): RuleRow => ({
  id: "r1",
  careerLevel: "Associate",
  product: "MAPD",
  commissionType: "T65",
  calculationMethod: "FIXED",
  rateCents: 30000,
  ratePercent: null,
  percentBasis: null,
  status: "ACTIVE",
  effectiveFrom: "2026-10-08",
  effectiveTo: null,
  ...overrides,
});

const input = (overrides: Partial<NewRuleInput> = {}): NewRuleInput => ({
  careerLevel: "Associate",
  product: "mapd",
  commissionType: "t65",
  method: "FIXED",
  rateCents: 32500,
  ratePercent: null,
  effectiveFrom: "2027-01-01",
  ...overrides,
});

describe("parsing", () => {
  it("normalizes product and category codes", () => {
    expect(normalizeCode(" final expense ")).toBe("FINAL_EXPENSE");
    expect(normalizeCode("Plan-Change")).toBe("PLAN_CHANGE");
    expect(normalizeCode("  !! ")).toBe("");
  });

  it("parses dollars into integer cents without floating point", () => {
    expect(parseDollarsToCents("300")).toBe(30000);
    expect(parseDollarsToCents("$1,200.5")).toBe(120050);
    expect(parseDollarsToCents("12.50")).toBe(1250);
    expect(parseDollarsToCents("0.07")).toBe(7);
    expect(parseDollarsToCents("19.99")).toBe(1999);
    for (const bad of ["", "abc", "-5", "1.234", "1e3", "12.", ".5"]) {
      expect(parseDollarsToCents(bad)).toBeNull();
    }
  });

  it("parses percentages between 0 and 100", () => {
    expect(parsePercent("75")).toBe(75);
    expect(parsePercent("12.5%")).toBe(12.5);
    for (const bad of ["", "101", "-1", "abc", "1.23456"]) expect(parsePercent(bad)).toBeNull();
  });

  it("validates ISO dates and steps back one day across month and year ends", () => {
    expect(isIsoDate("2026-02-28")).toBe(true);
    expect(isIsoDate("2026-02-30")).toBe(false);
    expect(isIsoDate("10/08/2026")).toBe(false);
    expect(dayBefore("2027-01-01")).toBe("2026-12-31");
    expect(dayBefore("2026-03-01")).toBe("2026-02-28");
  });
});

describe("planRuleChange", () => {
  it("adds a new rule and closes the open one the day before", () => {
    const plan = planRuleChange([rule()], input(), LEVELS);
    expect(plan).toEqual({
      ok: true,
      close: [{ id: "r1", effectiveTo: "2026-12-31" }],
      insert: {
        careerLevel: "Associate",
        product: "MAPD",
        commissionType: "T65",
        calculationMethod: "FIXED",
        rateCents: 32500,
        ratePercent: null,
        percentBasis: null,
        effectiveFrom: "2027-01-01",
      },
    });
  });

  it("closes nothing when there is no earlier rule", () => {
    expect(planRuleChange([], input(), LEVELS)).toMatchObject({ ok: true, close: [] });
  });

  it("never back-dates over an existing or later rate", () => {
    expect(planRuleChange([rule({ effectiveFrom: "2027-01-01" })], input(), LEVELS)).toMatchObject({ ok: false });
    expect(planRuleChange([rule({ effectiveFrom: "2027-06-01" })], input(), LEVELS)).toMatchObject({ ok: false });
  });

  it("leaves already-ended rules and rules for other keys alone", () => {
    const rules = [
      rule({ id: "old", effectiveTo: "2026-12-01" }),
      rule({ id: "other-level", careerLevel: "Senior" }),
      rule({ id: "other-type", commissionType: "RENEWAL" }),
    ];
    expect(planRuleChange(rules, input(), LEVELS)).toMatchObject({ ok: true, close: [] });
  });

  it("stores percent rules as a percent of annual premium", () => {
    const plan = planRuleChange(
      [],
      input({ product: "Final Expense", commissionType: "first year", method: "PERCENT", rateCents: null, ratePercent: 75 }),
      LEVELS
    );
    expect(plan).toMatchObject({
      ok: true,
      insert: {
        product: "FINAL_EXPENSE",
        commissionType: "FIRST_YEAR",
        calculationMethod: "PERCENT",
        rateCents: null,
        ratePercent: 75,
        percentBasis: "ANNUAL_PREMIUM",
      },
    });
  });

  it("rejects unknown levels, bad rates, bad dates and empty names", () => {
    expect(planRuleChange([], input({ careerLevel: "Wizard" }), LEVELS)).toMatchObject({ ok: false });
    expect(planRuleChange([], input({ rateCents: null }), LEVELS)).toMatchObject({ ok: false });
    expect(planRuleChange([], input({ method: "PERCENT", ratePercent: 150, rateCents: null }), LEVELS)).toMatchObject({ ok: false });
    expect(planRuleChange([], input({ effectiveFrom: "soon" }), LEVELS)).toMatchObject({ ok: false });
    expect(planRuleChange([], input({ product: "  " }), LEVELS)).toMatchObject({ ok: false });
    expect(planRuleChange([], input({ commissionType: "" }), LEVELS)).toMatchObject({ ok: false });
  });
});

describe("display helpers", () => {
  it("describes fixed and percent rates", () => {
    expect(describeRate(rule())).toBe("$300.00");
    expect(
      describeRate(rule({ calculationMethod: "PERCENT", rateCents: null, ratePercent: 75, percentBasis: "ANNUAL_PREMIUM" }))
    ).toBe("75% of annual premium");
    expect(describeRate(rule({ status: "NOT_CONFIGURED" }))).toBe("Not configured");
  });

  it("classifies rules as current, upcoming or ended", () => {
    expect(ruleTiming(rule(), "2026-10-10")).toBe("current");
    expect(ruleTiming(rule({ effectiveFrom: "2027-01-01" }), "2026-10-10")).toBe("upcoming");
    expect(ruleTiming(rule({ effectiveTo: "2026-10-09" }), "2026-10-10")).toBe("ended");
    expect(ruleTiming(rule({ effectiveTo: "2026-10-10" }), "2026-10-10")).toBe("current");
  });

  it("lists current and upcoming rules ordered by product, level order, category", () => {
    const rules = [
      rule({ id: "a", careerLevel: "Senior", commissionType: "T65" }),
      rule({ id: "b", careerLevel: "Associate", commissionType: "T65" }),
      rule({ id: "c", careerLevel: "Associate", commissionType: "RENEWAL" }),
      rule({ id: "gone", effectiveTo: "2026-01-01" }),
    ];
    expect(currentRules(rules, "2026-10-10", LEVELS).map((r) => r.id)).toEqual(["c", "b", "a"]);
  });
});

describe("career levels", () => {
  it("adds new levels on top of the ladder with a unique name", () => {
    expect(planNewLevel([], " Associate  ")).toEqual({ ok: true, name: "Associate", rank: 1 });
    expect(planNewLevel([{ name: "Associate", rank: 1 }, { name: "Senior", rank: 2 }], "Lead")).toEqual({
      ok: true,
      name: "Lead",
      rank: 3,
    });
  });

  it("rejects empty, duplicate (any case) and over-long names", () => {
    expect(planNewLevel([], "  ")).toMatchObject({ ok: false });
    expect(planNewLevel([{ name: "Associate", rank: 1 }], "associate")).toMatchObject({ ok: false });
    expect(planNewLevel([], "x".repeat(61))).toMatchObject({ ok: false });
    expect(normalizeLevelName("  Senior   Agent ")).toBe("Senior Agent");
  });

  it("lists active levels lowest first", () => {
    const level = (name: string, rank: number, active = true) => ({
      id: name,
      agencyId: "a",
      name,
      rank,
      visibility: "own" as const,
      active,
    });
    expect(activeLevelNames([level("B", 2), level("Old", 1, false), level("A", 1), level("C", 3)])).toEqual(["A", "B", "C"]);
  });
});
