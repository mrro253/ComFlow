import { describe, expect, it } from "vitest";
import { hasMarshallApproval, parseAddedLines, parseNameStatus, parseUnmergedBranches } from "../parseDiff";
import { formatBranchReport } from "../report";
import { evaluateChanges, majorVersion, type ChangedFile, type GuardInput } from "../protectedChanges";

const base: GuardInput = { files: [], addedLines: {}, packages: [], readme: "", approved: false };
const run = (patch: Partial<GuardInput>) => evaluateChanges({ ...base, ...patch });
const file = (path: string, status: ChangedFile["status"] = "A"): ChangedFile => ({ path, status });
const categories = (patch: Partial<GuardInput>) => run(patch).violations.map((v) => v.category);

describe("allowed changes (no approval needed)", () => {
  it("allows new features: screens, carriers, services, tests, docs and new tables", () => {
    const files = [
      file("app/(dashboard)/reports/page.tsx", "M"), file("components/dashboard/new-chart.tsx"),
      file("lib/carriers/newcarrier/parse.ts"), file("lib/services/newService.ts"),
      file("lib/reporting/__tests__/x.test.ts"), file("docs/new.md"), file("worker/src/carriers/newcarrier.ts"),
      file("supabase/migrations/0099_new_feature.sql"),
    ];
    const addedLines = { "supabase/migrations/0099_new_feature.sql": ["create table public.new_feature (id uuid primary key);", "alter table public.new_feature enable row level security;", "create policy new_feature_read on public.new_feature for select using (true);"] };
    expect(run({ files, addedLines })).toMatchObject({ violations: [], ok: true });
  });
  it("allows a small new utility package that is listed in the README", () => {
    const result = run({ readme: "We use date-fns for dates.", packages: [{ path: "package.json", before: { dependencies: { react: "^19.0.0" } }, after: { dependencies: { react: "^19.0.0", "date-fns": "^4.1.0" } } }] });
    expect(result.ok).toBe(true);
  });
  it("allows a same-major bump of a core package", () => {
    const pkg = (next: string) => ({ dependencies: { next } });
    expect(run({ packages: [{ path: "package.json", before: pkg("^15.1.4"), after: pkg("^15.5.0") }] }).ok).toBe(true);
  });
  it("allows new CRM integration code (outbound-write safety is a rulebook requirement, not a guard check)", () => {
    expect(run({ files: [file("lib/crm/gohighlevel/newWriter.ts")], addedLines: { "lib/crm/gohighlevel/newWriter.ts": ['import { x } from "@/lib/crypto/credentials";'] } }).ok).toBe(true);
  });
});

describe("protected: hosting, platform, tech", () => {
  it.each([
    ["vercel.json"], ["worker/hosting/Dockerfile.gateway"], [".github/workflows/ci.yml"], ["infra/main.tf"],
    ["worker/container-entrypoint.sh"], ["Dockerfile"], ["compose.rehearsal.yaml"],
  ])("flags hosting file %s", (path) => { expect(categories({ files: [file(path)] })).toContain("hosting"); });
  it.each([["next.config.ts"], ["tailwind.config.ts"], ["middleware.ts"], ["lib/supabase/server.ts"], ["supabase/config.toml"]])("flags platform config %s", (path) => {
    expect(categories({ files: [file(path, "M")] })).toContain("platform");
  });
  it("flags files in a new language but not docs or fixtures", () => {
    expect(categories({ files: [file("worker/hosting/gateway/main.go")] })).toContain("language");
    expect(categories({ files: [file("scripts/check.py")] })).toContain("language");
    expect(categories({ files: [file("docs/example.py"), file("lib/x/__fixtures__/a.py")] })).not.toContain("language");
  });
  it("flags the rulebook and the guard itself", () => {
    expect(categories({ files: [file(".cursorrules", "M"), file("lib/repoGuard/protectedChanges.ts", "M")] })).toEqual(["rulebook", "rulebook"]);
  });
});

describe("protected: dependencies", () => {
  const change = (before: Record<string, string>, after: Record<string, string>, readme = "") =>
    run({ readme, packages: [{ path: "package.json", before: { dependencies: before }, after: { dependencies: after } }] });
  it("flags adding a framework, database layer, auth provider or host package", () => {
    for (const name of ["@vercel/node", "prisma", "next-auth", "express", "@supabase/auth-helpers-nextjs", "playwright-core"]) {
      expect(change({}, { [name]: "^1.0.0" }, name).violations.map((v) => v.category)).toContain("frameworks");
    }
  });
  it("flags a major-version change of a core package, including Playwright", () => {
    expect(change({ next: "^15.1.4" }, { next: "^16.0.0" }).ok).toBe(false);
    expect(change({ react: "19.0.0" }, { react: "latest" }).ok).toBe(false);
  });
  it("flags removing a core package", () => { expect(change({ recharts: "^2.15.0" }, {}).ok).toBe(false); });
  it("flags a new package that the README does not mention", () => {
    const result = change({}, { "left-pad": "^1.0.0" });
    expect(result.violations).toEqual([expect.objectContaining({ category: "dependencies" })]);
  });
  it("flags a changed engines field and notes changed overrides", () => {
    const result = run({ packages: [{ path: "package.json", before: { engines: { node: ">=20" }, overrides: {} }, after: { engines: { node: ">=22" }, overrides: { next: { postcss: "8.5.0" } } } }] });
    expect(result.violations.map((v) => v.category)).toEqual(["frameworks"]);
    expect(result.notices).toHaveLength(1);
  });
  it("reads major versions", () => {
    expect(majorVersion("^1.49.1")).toBe(1);
    expect(majorVersion("~2.0")).toBe(2);
    expect(majorVersion("19")).toBe(19);
    expect(majorVersion("latest")).toBeNull();
  });
});

describe("protected: database security", () => {
  const migration = (lines: string[], status: ChangedFile["status"] = "A") =>
    run({ files: [file("supabase/migrations/0099_x.sql", status)], addedLines: { "supabase/migrations/0099_x.sql": lines } });
  it.each([
    ['drop policy if exists "users_insert_self_or_owner" on public.users;'],
    ["alter policy p on public.t using (true);"],
    ["alter table public.t disable row level security;"],
    ["create or replace function public.get_my_agency_id() returns uuid as $$ select null $$ language sql;"],
    ["create policy allocated_transaction_read on public.carrier_transactions for select using (true);"],
    ['create policy "x" on public.users for insert with check (true);'],
    ["drop trigger guard on public.carrier_transactions;"],
    ["drop table public.old_things;"],
  ])("flags %s", (line) => { expect(migration([line]).violations.map((v) => v.category)).toContain("security"); });
  it("flags editing an existing migration", () => {
    expect(migration(["-- comment"], "M").violations[0].reason).toMatch(/new files only/);
  });
  it("ignores flagged words inside SQL comments", () => { expect(migration(["-- we never drop policy here"]).ok).toBe(true); });
});

describe("protected: layering and browser automation", () => {
  const added = (path: string, line: string) => run({ files: [file(path, "M")], addedLines: { [path]: [line] } });
  it("flags business logic importing UI and pure logic importing the database", () => {
    expect(added("lib/services/x.ts", 'import { Card } from "@/components/ui/card";').violations[0].category).toBe("platform");
    expect(added("lib/reporting/x.ts", 'import { createClient } from "@/lib/supabase/server";').violations[0].category).toBe("platform");
    expect(added("lib/carriers/x.ts", 'import { listStatements } from "@/lib/repositories/statementRepository";').violations[0].category).toBe("platform");
  });
  it("flags a UI component importing repositories directly but allows server pages to", () => {
    expect(added("components/x.tsx", 'import { a } from "@/lib/repositories/userRepository";').ok).toBe(false);
    expect(added("app/(dashboard)/x/page.tsx", 'import { a } from "@/lib/repositories/userRepository";').ok).toBe(true);
  });
  it("ignores type-only imports of repository types", () => {
    expect(added("lib/reporting/x.ts", 'import type { Row } from "@/lib/repositories/statementRepository";').ok).toBe(true);
  });
  it("flags Playwright outside worker/ only", () => {
    expect(added("lib/x.ts", 'import { chromium } from "playwright";').violations[0].category).toBe("automation");
    expect(added("app/api/x/route.ts", 'const p = require("puppeteer");').violations[0].category).toBe("automation");
    expect(added("worker/src/x.ts", 'import { chromium } from "playwright";').ok).toBe(true);
  });
  it("does not flag tests or deleted files", () => {
    expect(run({ files: [file("lib/reporting/__tests__/x.test.ts")], addedLines: { "lib/reporting/__tests__/x.test.ts": ['import x from "@/lib/supabase/server";'] } }).ok).toBe(true);
  });
});

describe("approval", () => {
  it("passes when Marshall's approval is recorded, while still listing what was approved", () => {
    const result = run({ files: [file("vercel.json")], approved: true });
    expect(result.ok).toBe(true);
    expect(result.violations).toHaveLength(1);
  });
  it("fails without approval and de-duplicates repeated findings", () => {
    const result = run({ files: [file("worker/hosting/a/Dockerfile"), file("worker/hosting/a/Dockerfile")] });
    expect(result.ok).toBe(false);
    expect(result.violations.filter((v) => v.category === "hosting")).toHaveLength(1);
  });
  it("reads Approved-by lines from commit messages", () => {
    expect(hasMarshallApproval("Add hosting\n\nApproved-by: Marshall (2026-11-10) Fly worker")).toBe(true);
    expect(hasMarshallApproval("I think Marshall approved-by: someone else")).toBe(false);
    expect(hasMarshallApproval("Approved-by: Ryan")).toBe(false);
  });
});

describe("diff parsing", () => {
  it("parses name-status output including renames", () => {
    expect(parseNameStatus("A\ta.ts\nM\tb.ts\nD\tc.ts\nR100\told.ts\tnew.ts\n")).toEqual([
      { path: "a.ts", status: "A" }, { path: "b.ts", status: "M" }, { path: "c.ts", status: "D" }, { path: "new.ts", status: "R" },
    ]);
  });
  it("collects only added lines per file and ignores deleted files and header lines", () => {
    const diff = [
      "diff --git a/x.ts b/x.ts", "index 1..2 100644", "--- a/x.ts", "+++ b/x.ts", "@@ -1,2 +1,3 @@", "-old", "+new line", "+++ not a header",
      "diff --git a/gone.ts b/gone.ts", "--- a/gone.ts", "+++ /dev/null", "@@ -1 +0,0 @@", "-bye",
    ].join("\n");
    expect(parseAddedLines(diff)).toEqual({ "x.ts": ["new line", "++ not a header"] });
  });
});

describe("branch report", () => {
  it("lists remote branches and drops the HEAD pointer and the base branch", () => {
    const output = "  origin/HEAD -> origin/Main\n  origin/Main\n  origin/feature/a\n  origin/fix/b\n";
    expect(parseUnmergedBranches(output, "origin/Main")).toEqual(["origin/feature/a", "origin/fix/b"]);
  });
  it("prints one line per branch with category counts", () => {
    const stopped = run({ files: [file("worker/hosting/a"), file("worker/hosting/b"), file("vercel.json")] });
    const clear = run({ files: [file("lib/x.ts")] });
    const approved = run({ files: [file("vercel.json")], approved: true });
    const text = formatBranchReport([
      { branch: "origin/feature/a", fileCount: 3, result: stopped },
      { branch: "origin/feature/bb", fileCount: 1, result: clear },
      { branch: "origin/feature/c", fileCount: 1, result: approved },
    ]);
    const lines = text.split("\n");
    expect(lines[0]).toMatch(/^origin\/feature\/a\s+STOPPED\s+hosting \(3\)$/);
    expect(lines[1]).toMatch(/^origin\/feature\/bb\s+PASS\s+\(1 files\)$/);
    expect(lines[2]).toMatch(/^origin\/feature\/c\s+APPROVED\s+hosting \(1\)$/);
    expect(formatBranchReport([])).toBe("No unmerged branches.");
  });
});
