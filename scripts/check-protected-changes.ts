import { execFileSync } from "node:child_process";
import { hasMarshallApproval, parseAddedLines, parseNameStatus, parseUnmergedBranches } from "../lib/repoGuard/parseDiff";
import { evaluateChanges, type GuardResult, type PackageChange, type PackageJsonLike } from "../lib/repoGuard/protectedChanges";
import { formatBranchReport } from "../lib/repoGuard/report";

// Run via `npm run guard` (executes from worker/, so the repository root is "..").
//   npm run guard                     checks HEAD against Main
//   npm run guard -- --base origin/Main --head some-branch
//   npm run guard -- --all            one-line report for every remote branch not merged into Main
// Fails (exit 1) when the checked branch touches the protected areas listed in .cursorrules
// without an "Approved-by: Marshall" line in one of its commit messages. --all only reports.
// TODO: also run this in CI once CI is approved (CI files are protected).

const root = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();

function git(args: string[], allowFailure = false): string {
  try {
    return execFileSync("git", args, { cwd: root, encoding: "utf8", maxBuffer: 256 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] });
  } catch (error) {
    if (allowFailure) return "";
    throw error;
  }
}

const argValue = (flag: string) => {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
};
const refExists = (ref: string) => git(["rev-parse", "--verify", "--quiet", ref], true).trim() !== "";
const readJson = (ref: string, path: string): PackageJsonLike | null => {
  const text = git(["show", `${ref}:${path}`], true);
  if (!text) return null;
  try { return JSON.parse(text) as PackageJsonLike; } catch { return null; }
};

type Analysis = { fileCount: number; result: GuardResult };

function analyze(base: string, head: string): Analysis {
  const mergeBase = git(["merge-base", base, head]).trim();
  const files = parseNameStatus(git(["diff", "--name-status", "-M", `${base}...${head}`]));
  if (files.length === 0) return { fileCount: 0, result: { violations: [], notices: [], ok: true } };
  const addedLines = parseAddedLines(git(["diff", "-U0", "--no-color", "-M", `${base}...${head}`]));
  const packages: PackageChange[] = files
    .filter((file) => /(^|\/)package\.json$/.test(file.path) && !file.path.includes("node_modules"))
    .map((file) => ({ path: file.path, before: readJson(mergeBase, file.path), after: readJson(head, file.path) }));
  const result = evaluateChanges({
    files,
    addedLines,
    packages,
    readme: git(["show", `${head}:README.md`], true),
    approved: hasMarshallApproval(git(["log", `${mergeBase}..${head}`, "--format=%B"])),
  });
  return { fileCount: files.length, result };
}

function reportAll(): never {
  const base = argValue("--base") ?? (refExists("origin/Main") ? "origin/Main" : "Main");
  if (!refExists(base)) {
    console.error(`Cannot find "${base}". Run: git fetch`);
    process.exit(2);
  }
  const branches = parseUnmergedBranches(git(["branch", "-r", "--no-merged", base]), base);
  const rows = branches.map((branch) => ({ branch, ...analyze(base, branch) }));
  console.log(`Guard report: ${branches.length} remote branches not merged into ${base} (run "git fetch" first for the latest).\n`);
  console.log(formatBranchReport(rows));
  const stopped = rows.filter((row) => !row.result.ok).length;
  console.log(`\n${stopped} stopped, ${rows.length - stopped} clear. Details for one branch: npm run guard -- --head <branch>`);
  console.log("Branches are checked one by one against " + base + "; stacked branches repeat the work of the ones below them.");
  process.exit(0);
}

if (process.argv.includes("--all")) reportAll();

const base = argValue("--base") ?? (refExists("Main") ? "Main" : "origin/Main");
const head = argValue("--head") ?? "HEAD";
if (!refExists(base) || !refExists(head)) {
  console.error(`Cannot find "${base}" or "${head}". Run: git fetch`);
  process.exit(2);
}

const { fileCount, result } = analyze(base, head);
if (fileCount === 0) {
  console.log(`Guard: no changes between ${base} and ${head}.`);
  process.exit(0);
}
console.log(`Guard: ${fileCount} changed files, ${base}...${head}`);
for (const notice of result.notices) console.log(`  note: ${notice}`);
if (result.violations.length === 0) {
  console.log("Guard: OK. Nothing here needs Marshall's approval.");
  process.exit(0);
}
for (const v of result.violations) console.log(`  [${v.category}] ${v.path}: ${v.reason}`);
if (result.ok) {
  console.log("Guard: OK. The items above were flagged but a commit records 'Approved-by: Marshall'.");
  process.exit(0);
}
console.log("\nGuard: STOPPED. These changes need Marshall's approval before merging into Main.");
console.log("Push the branch, ask Marshall, and only after he says yes add a commit whose message ends with:");
console.log("  Approved-by: Marshall (<date>) <what was approved>");
process.exit(1);
