export interface CoverageStatement {
  carrier: string;
  userId: string | null;
  statementMonth: string | null;
  status: string;
}

/** Presence only: absence never establishes unpaid commission or a carrier schedule. */
export function statementCoverage(statements: CoverageStatement[], year: number) {
  const groups = new Map<string, { carrier: string; userId: string | null; months: string[] }>();
  for (const s of statements) {
    if (s.status === "superseded") continue;
    const key = JSON.stringify([s.carrier, s.userId]);
    if (!groups.has(key)) groups.set(key, { carrier: s.carrier, userId: s.userId, months: [] });
  }
  return [...groups.values()].sort((a, b) => a.carrier.localeCompare(b.carrier) || (a.userId ?? "").localeCompare(b.userId ?? "")).map((group) => ({
    ...group,
    months: Array.from({ length: 12 }, (_, index) => {
      const month = `${year}-${String(index + 1).padStart(2, "0")}`;
      const matches = statements.filter((s) => s.carrier === group.carrier && s.userId === group.userId && s.statementMonth?.slice(0, 7) === month && s.status !== "superseded");
      if (matches.some((s) => s.status !== "imported")) return "Needs review";
      return matches.length ? "Imported" : "None on file";
    }),
  }));
}
