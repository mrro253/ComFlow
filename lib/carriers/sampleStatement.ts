/**
 * A fully SYNTHETIC Ultimate-style statement for trying the upload -> preview ->
 * import -> assign flow when no real PDF is at hand. Names match the demo users in
 * supabase/seed.sql; member ids and amounts are invented. Never use real data here.
 *
 * Generate a PDF with: npm run sample:statement
 */

interface SampleRow {
  memberId: string;
  writingAgent: string;
  money: string;
  type: "COMMISSION" | "RENEWAL" | "CHARGEBACK";
}

const ROWS: SampleRow[] = [
  { memberId: "UL9000001", writingAgent: "AGENT, ALEX", money: "300.00", type: "COMMISSION" },
  { memberId: "UL9000002", writingAgent: "PATEL, PRIYA", money: "350.00", type: "COMMISSION" },
  { memberId: "UL9000003", writingAgent: "NGUYEN, CHRIS", money: "12.50", type: "RENEWAL" },
  { memberId: "UL9000004", writingAgent: "OWNER, JANE", money: "400.00", type: "COMMISSION" },
  { memberId: "UL9000005", writingAgent: "BROOKS, TAYLOR", money: "(150.00)", type: "CHARGEBACK" },
  // Not on the team: lands as "Unassigned" so the assign flow can be tried.
  { memberId: "UL9000006", writingAgent: "STRANGER, ANN", money: "125.00", type: "COMMISSION" },
];

export function buildSampleStatementLines(month = "September 2026"): string[] {
  const rows = ROWS.map(
    (row) => `${row.memberId}01/01/2026${row.writingAgent}MCCW123W123PAYEE${row.money}$ ${row.type}`
  );
  return [
    "Ultimate Health Plans",
    "Commissions and Renewals Statement",
    month,
    ...rows,
    "1,175.00$ COMMISSION Total",
    "12.50$ RENEWAL Total",
    "(150.00)$ CHARGEBACK Total",
    "W123 Total1,037.50$",
  ];
}
