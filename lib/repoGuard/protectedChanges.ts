/**
 * Pure rules behind `npm run guard`: flags changes to the app's technical backbone
 * (frameworks, hosting, database/auth platform, core security, browser-automation
 * location, the rulebook itself) so they get Marshall's approval. Everything else,
 * including new features, carriers, screens and tables, is allowed.
 *
 * No I/O here; scripts/check-protected-changes.ts feeds in the git diff.
 * Changes to this file are themselves protected (see RULEBOOK_PATTERNS).
 */

export type GuardCategory = "frameworks" | "hosting" | "platform" | "security" | "automation" | "language" | "dependencies" | "rulebook";

export interface ChangedFile {
  path: string;
  /** A added, M modified, D deleted, R renamed. */
  status: "A" | "M" | "D" | "R";
}

export interface PackageJsonLike {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  overrides?: unknown;
  engines?: unknown;
}

export interface PackageChange {
  path: string;
  before: PackageJsonLike | null;
  after: PackageJsonLike | null;
}

export interface GuardInput {
  files: readonly ChangedFile[];
  /** Added lines (without the leading "+") per file path. */
  addedLines: Readonly<Record<string, readonly string[]>>;
  packages: readonly PackageChange[];
  /** README text, used to check that new dependencies are listed. */
  readme: string;
  /** True when a commit on the branch carries an "Approved-by: Marshall" line. */
  approved: boolean;
}

export interface Violation {
  category: GuardCategory;
  path: string;
  reason: string;
}

export interface GuardResult {
  violations: Violation[];
  notices: string[];
  /** True when nothing is flagged, or every flag has Marshall's recorded approval. */
  ok: boolean;
}

// ---------------------------------------------------------------------------
// Path rules
// ---------------------------------------------------------------------------

const HOSTING_PATTERNS: readonly RegExp[] = [
  /(^|\/)(vercel\.json|netlify\.toml|fly\.toml|Procfile|amplify\.yml|serverless\.ya?ml|render\.ya?ml|railway\.(json|toml))$/i,
  /(^|\/)\.vercel\//,
  /(^|\/)\.github\/workflows\//,
  /(^|\/)Dockerfile[^/]*$/i,
  /(^|\/)(docker-compose|compose)[^/]*\.ya?ml$/i,
  /(^|\/)\.dockerignore$/i,
  /(^|\/)hosting\//,
  /\.(tf|tfvars)$/i,
  /(^|\/)container-entrypoint\.sh$/i,
];

const PLATFORM_PATTERNS: readonly RegExp[] = [
  /(^|\/)(next|tailwind|postcss)\.config\.[cm]?[jt]s$/,
  /^middleware\.ts$/,
  /^lib\/supabase\//,
  /^supabase\/config\.toml$/,
  /(^|\/)\.(nvmrc|node-version)$/,
];

const RULEBOOK_PATTERNS: readonly RegExp[] = [
  /^\.cursorrules$/,
  /^lib\/repoGuard\//,
  /^scripts\/check-protected-changes\.ts$/,
];

const NEW_LANGUAGE_EXTENSIONS = /\.(go|py|rs|java|kt|rb|php|cs|swift|ps1)$/i;

const matches = (patterns: readonly RegExp[], path: string) => patterns.some((pattern) => pattern.test(path));

// ---------------------------------------------------------------------------
// Dependency rules
// ---------------------------------------------------------------------------

const CORE_PACKAGES = new Set([
  "next", "react", "react-dom", "typescript", "tailwindcss", "recharts",
  "playwright", "playwright-core", "@playwright/test",
]);

/** Packages that mean a different framework, database layer, auth provider or host. */
const PROTECTED_PACKAGE_PATTERNS: readonly RegExp[] = [
  /^@supabase\//,
  /^@vercel\//, /^@aws-sdk\//, /^aws-sdk$/, /^@cloudflare\//, /^wrangler$/, /^netlify/, /^serverless$/, /^firebase/,
  /^prisma$/, /^@prisma\//, /^drizzle-/, /^typeorm$/, /^sequelize$/, /^knex$/, /^mongoose$/,
  /^next-auth$/, /^@auth0\//, /^@clerk\//, /^passport/,
  /^(express|fastify|koa|@nestjs\/.+|vue|svelte|@angular\/.+|remix|@remix-run\/.+|astro)$/,
];

const isProtectedPackage = (name: string) => CORE_PACKAGES.has(name) || matches(PROTECTED_PACKAGE_PATTERNS, name);

const DEP_FIELDS = ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"] as const;

function flattenDeps(pkg: PackageJsonLike | null): Map<string, string> {
  const merged = new Map<string, string>();
  if (!pkg) return merged;
  for (const field of DEP_FIELDS) for (const [name, spec] of Object.entries(pkg[field] ?? {})) merged.set(name, spec);
  return merged;
}

/** Major version of a spec like "^1.49.1" or "1.65.0"; null when it cannot be read ("latest", "*", URLs). */
export function majorVersion(spec: string): number | null {
  const match = /^[\^~>=<v\s]*(\d+)(?:\.|$)/.exec(spec.trim());
  return match ? Number(match[1]) : null;
}

function checkPackages(change: PackageChange, readme: string, out: Violation[], notices: string[]) {
  const before = flattenDeps(change.before);
  const after = flattenDeps(change.after);
  for (const [name, spec] of after) {
    const previous = before.get(name);
    if (previous === spec) continue;
    if (isProtectedPackage(name)) {
      if (previous === undefined) {
        out.push({ category: "frameworks", path: change.path, reason: `Adds ${name}, a framework/platform/hosting-type package.` });
      } else {
        const from = majorVersion(previous), to = majorVersion(spec);
        if (from === null || to === null || from !== to) {
          out.push({ category: "frameworks", path: change.path, reason: `Changes ${name} to a different major version (${previous} -> ${spec}).` });
        }
      }
    } else if (previous === undefined && !readme.includes(name)) {
      out.push({ category: "dependencies", path: change.path, reason: `New dependency ${name} is not listed in README.md. Add it (and why) to the README.` });
    }
  }
  for (const name of before.keys()) {
    if (!after.has(name) && isProtectedPackage(name)) {
      out.push({ category: "frameworks", path: change.path, reason: `Removes ${name}, a framework/platform package.` });
    }
  }
  if (JSON.stringify(change.before?.overrides) !== JSON.stringify(change.after?.overrides)) {
    notices.push(`${change.path}: npm "overrides" changed. Mention why in the README.`);
  }
  if (JSON.stringify(change.before?.engines) !== JSON.stringify(change.after?.engines)) {
    out.push({ category: "frameworks", path: change.path, reason: 'Changes the supported runtime ("engines").' });
  }
}

// ---------------------------------------------------------------------------
// Migration (database security) rules
// ---------------------------------------------------------------------------

const CORE_TABLES = "(carrier_transactions|users|agencies|commission_statements|audit_[a-z_]+)";
const CORE_HELPERS = "(get_my_agency_id|get_my_role|can_see_direct_reports)";

const MIGRATION_PATTERNS: readonly { pattern: RegExp; reason: string }[] = [
  { pattern: /\bdrop\s+policy\b/i, reason: "Drops a row-level-security policy." },
  { pattern: /\balter\s+policy\b/i, reason: "Alters a row-level-security policy." },
  { pattern: /\b(disable|no\s+force)\s+row\s+level\s+security\b/i, reason: "Turns off row level security." },
  { pattern: new RegExp(`\\b(create\\s+or\\s+replace|drop)\\s+function\\s+(if\\s+exists\\s+)?(public\\.)?${CORE_HELPERS}\\b`, "i"), reason: "Redefines a shared access-control helper that every table's security depends on." },
  { pattern: new RegExp(`\\bcreate\\s+policy\\s+("[^"]+"|\\S+)\\s+on\\s+(public\\.)?${CORE_TABLES}\\b`, "i"), reason: "Adds an access policy to a core table (users, agencies, statements, carrier entries or audit)." },
  { pattern: /\b(drop|disable)\s+trigger\b|\balter\s+table\s+\S+\s+(disable|enable\s+replica)\s+trigger\b/i, reason: "Removes or disables a database trigger (immutability/audit guards)." },
  { pattern: /\bdrop\s+table\b|\btruncate\b/i, reason: "Removes an existing table or its data." },
];

function checkMigration(file: ChangedFile, lines: readonly string[], out: Violation[]) {
  if (file.status !== "A") {
    out.push({ category: "security", path: file.path, reason: "Edits, renames or deletes an existing migration. Migrations are new files only." });
  }
  const reported = new Set<string>();
  for (const line of lines) {
    const code = line.replace(/--.*$/, "");
    for (const { pattern, reason } of MIGRATION_PATTERNS) {
      if (pattern.test(code) && !reported.has(reason)) {
        reported.add(reason);
        out.push({ category: "security", path: file.path, reason });
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Layering and browser-automation rules (added lines only)
// ---------------------------------------------------------------------------

const isSourceFile = (path: string) => /\.(ts|tsx|mts|js|jsx|mjs)$/.test(path) && !/(^|\/)(__tests__|__fixtures__)\//.test(path) && !/\.test\./.test(path);
// Type-only imports are erased at build time, so they cannot create a runtime dependency.
const importsOf = (lines: readonly string[]) =>
  lines.filter((line) => /\b(from|import|require)\b/.test(line) && !/^\s*import\s+type\b/.test(line));

function checkLayering(path: string, lines: readonly string[], out: Violation[]) {
  const imports = importsOf(lines);
  const hit = (pattern: RegExp) => imports.some((line) => pattern.test(line));
  if (/^lib\//.test(path) && hit(/["']@\/(components|app)(\/|["'])/)) {
    out.push({ category: "platform", path, reason: "Business logic in lib/ imports UI (components or app)." });
  }
  if (/^lib\/(carriers|reporting|commission-engine)\//.test(path) && hit(/["'](@\/lib\/(repositories|supabase)|@supabase\/)/)) {
    out.push({ category: "platform", path, reason: "Pure logic (carriers, reporting, commission engine) imports the database layer." });
  }
  if (/^components\//.test(path) && hit(/["']@\/lib\/(repositories|supabase)/)) {
    out.push({ category: "platform", path, reason: "A UI component imports the database layer directly (use server actions/services)." });
  }
}

function checkAutomation(path: string, lines: readonly string[], out: Violation[]) {
  if (/^worker\//.test(path)) return;
  if (importsOf(lines).some((line) => /["'](playwright|playwright-core|@playwright\/test|puppeteer)["']/.test(line))) {
    out.push({ category: "automation", path, reason: "Browser automation outside worker/. It must run only in the worker service." });
  }
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export function evaluateChanges(input: GuardInput): GuardResult {
  const violations: Violation[] = [];
  const notices: string[] = [];

  for (const file of input.files) {
    const lines = input.addedLines[file.path] ?? [];
    if (matches(RULEBOOK_PATTERNS, file.path)) {
      violations.push({ category: "rulebook", path: file.path, reason: "Changes the rulebook or the guard that enforces it." });
    }
    if (matches(HOSTING_PATTERNS, file.path)) {
      violations.push({ category: "hosting", path: file.path, reason: "Hosting, deployment or CI/CD file." });
    }
    if (matches(PLATFORM_PATTERNS, file.path)) {
      violations.push({ category: "platform", path: file.path, reason: "Core platform configuration (framework config, auth middleware, Supabase client/config)." });
    }
    if (file.status === "A" && NEW_LANGUAGE_EXTENSIONS.test(file.path) && !/^docs\//.test(file.path) && !/(^|\/)__fixtures__\//.test(file.path)) {
      violations.push({ category: "language", path: file.path, reason: "Adds a file in a language the app does not use (TypeScript/SQL only)." });
    }
    if (/^supabase\/migrations\/.+\.sql$/.test(file.path)) checkMigration(file, lines, violations);
    if (isSourceFile(file.path) && file.status !== "D") {
      checkLayering(file.path, lines, violations);
      checkAutomation(file.path, lines, violations);
    }
  }
  for (const change of input.packages) checkPackages(change, input.readme, violations, notices);

  // One line per distinct finding.
  const seen = new Set<string>();
  const unique = violations.filter((v) => {
    const key = `${v.category}|${v.path}|${v.reason}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return { violations: unique, notices, ok: unique.length === 0 || input.approved };
}
