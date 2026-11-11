import type { GuardCategory, GuardResult } from "./protectedChanges";

export type BranchReportRow = { branch: string; fileCount: number; result: GuardResult };

/** One line per branch for `npm run guard -- --all`. */
export function formatBranchReport(rows: readonly BranchReportRow[]): string {
  if (rows.length === 0) return "No unmerged branches.";
  const width = Math.max(...rows.map((row) => row.branch.length));
  return rows.map((row) => `${row.branch.padEnd(width)}  ${status(row)}`).join("\n");
}

function status({ result, fileCount }: BranchReportRow): string {
  if (result.violations.length === 0) return `PASS      (${fileCount} files)`;
  const tally = new Map<GuardCategory, Set<string>>();
  for (const v of result.violations) tally.set(v.category, (tally.get(v.category) ?? new Set()).add(v.path));
  const parts = [...tally].map(([category, paths]) => `${category} (${paths.size})`).join(", ");
  return `${result.ok ? "APPROVED  " : "STOPPED   "}${parts}`;
}
