import { describe, expect, it } from "vitest";
import {
  latestMonth,
  monthLabel,
  monthlyPaidSeries,
  producerGroup,
  sumCents,
  totalsByCategory,
  totalsByProducerGroup,
  type MetricTransaction,
} from "@/lib/reporting/carrierMetrics";

const users = new Map([
  ["owner", { role: "owner" as const, agentType: "independent" as const }],
  ["career", { role: "agent" as const, agentType: "career" as const }],
  ["indie", { role: "agent" as const, agentType: "independent" as const }],
  ["mgr", { role: "manager" as const, agentType: null }],
]);

function tx(overrides: Partial<MetricTransaction>): MetricTransaction {
  return { userId: "career", statementMonth: "2026-09", commissionType: "RENEWAL", amountCents: 1000, ...overrides };
}

describe("producerGroup", () => {
  it("never mixes the owner's personal production with agents", () => {
    expect(producerGroup("owner", users)).toBe("personal");
    expect(producerGroup("career", users)).toBe("career");
    expect(producerGroup("indie", users)).toBe("independent");
    expect(producerGroup("mgr", users)).toBe("other");
    expect(producerGroup(null, users)).toBe("unassigned");
    expect(producerGroup("not-visible", users)).toBe("other");
  });
});

describe("carrier metrics", () => {
  const data = [
    tx({ amountCents: 10000, commissionType: "COMMISSION" }),
    tx({ amountCents: 2892 }),
    tx({ amountCents: -2000, commissionType: "CHARGEBACK", userId: "indie" }),
    tx({ amountCents: 500, userId: null, statementMonth: "2026-10" }),
    tx({ amountCents: 700, userId: "owner", statementMonth: "2026-08" }),
  ];

  it("sums signed cents so chargebacks reduce totals", () => {
    expect(sumCents(data)).toBe(12092);
  });

  it("groups by carrier payment category", () => {
    const totals = totalsByCategory(data);
    expect(totals.find((t) => t.type === "CHARGEBACK")).toEqual({ type: "CHARGEBACK", cents: -2000, count: 1 });
    expect(totals.find((t) => t.type === "RENEWAL")?.cents).toBe(2892 + 500 + 700);
    expect(totals[0].type).toBe("COMMISSION");
  });

  it("groups by producer, keeping unassigned visible", () => {
    const groups = Object.fromEntries(totalsByProducerGroup(data, users).map((g) => [g.group, g.cents]));
    expect(groups).toEqual({ career: 12892, independent: -2000, unassigned: 500, personal: 700 });
  });

  it("builds a chronological monthly series in dollars", () => {
    expect(monthlyPaidSeries(data)).toEqual([
      { month: "Aug 26", total: 7 },
      { month: "Sep 26", total: 108.92 },
      { month: "Oct 26", total: 5 },
    ]);
    expect(latestMonth(data)).toBe("2026-10");
    expect(latestMonth([])).toBeNull();
    expect(monthLabel("2026-12")).toBe("Dec 26");
  });
});
