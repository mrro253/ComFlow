# CommissionFlow

Commission tracking for Medicare and Medicaid insurance agencies. It pulls
**carrier commission statements**, turns them into verified transactions, and
shows each person what the carrier actually paid them (and, for Career agents,
what the agency owes them).

> **Who this README is for:** Marshall (developer), Ryan (business owner) and
> either of their AI assistants. It is meant to be read top to bottom and to
> stay current: **every change updates it** (see the rule in `.cursorrules`).
> The business rules live in `.cursorrules`; this file describes the system as
> it is *right now*.

Last updated: 2026-10-10

> **Changing code? Read section 13 (Contributing) first.** Work on a branch, never directly on `Main`.

---

## 1. Status at a glance

| Area | State | How it was checked |
| --- | --- | --- |
| Statement PDF parsing (Ultimate) + reconciliation | Built | 113 unit tests on **synthetic** statements. **Not yet run on a real Ultimate PDF.** |
| Duplicate protection, writing-agent assignment, import preview | Built | Unit tests |
| Atomic import into the database (`import_statement`) | Built | SQL run on a throwaway Postgres 14: success, double import blocked, duplicate rolls back, wrong agency rejected, normal users denied |
| Database schema, RLS, immutability triggers | Built | Same throwaway Postgres run |
| Upload -> preview -> approve -> payments UI | Built | Compiles, lints, `next build` passes. **Never run in a browser against a live Supabase project** (no Docker/Supabase CLI was available while building) |
| Carrier login screen (encrypted credentials) | Built | Encryption unit-tested. UI **unverified** against live Supabase |
| Carrier worker (auto-pull from the portal) | Built, **unverified** | Typechecks. Ported from Ryan's working prototype but **never run** against the live Ultimate portal |
| Career-agent earnings, rate locks, payouts | Logic built, **no UI** | Unit tests. Intentionally not in the MVP screens |
| GoHighLevel output | Not started | |

**Bottom line:** the whole manual-upload path should work end to end the first
time someone runs it with Supabase, but nobody has done that yet. Treat the
first run as the real test, starting with `sample-statement.pdf` (section 2).

---

## 2. Try it (what to do with Ryan)

### A. One-time setup (Marshall)

See [Setup](#8-setup-and-environment-variables). In short: `npm install`,
`npx supabase start`, `npx supabase db reset`, fill `.env.local`,
generate `CREDENTIAL_ENCRYPTION_KEY`, `npm run dev`.

### B. Try the flow with no real PDF (synthetic data)

```bash
cd worker && npm install && cd ..    # once
npm run sample:statement             # writes sample-statement.pdf (synthetic, safe to share)
```

1. Sign in as `owner@commissionflow.dev` / `password123`.
2. **Statements** -> upload `sample-statement.pdf` (carrier: Ultimate Health Plans).
3. Review the preview: 6 payments, 1 chargeback, 1 unassigned ("STRANGER, ANN").
4. **Approve and import.**
5. **Payments**: see the totals by category. Assign the unassigned payment
   (tick "remember name" to apply it to future statements).
6. **Dashboard**: paid by carrier, categories, and "where it came from"
   (the owner's personal production is shown separately from the agency's).
7. Sign in as `agent2@commissionflow.dev` (Priya, Career) and confirm she only
   sees her own payment. Try uploading the same file again: it is recognized
   as a duplicate.

### C. Test with Ryan's real PDF

1. Ryan signs in as Owner and uploads a real Ultimate statement.
2. **Expected failure mode:** if the PDF layout differs from what the parser
   expects, the upload shows "could not be processed" and **imports nothing**
   (the parser refuses to guess when the numbers do not add up). Send Marshall
   the error text, **not the PDF** (it contains client data).
3. Check that statement total, category subtotals and the number of payments
   match the PDF. Check that every writing agent is attributed correctly.
4. In **Users**, make sure each person is typed (Career + level, or
   Independent) so names on the statement can be matched.

### D. Test a carrier login (Ryan's credentials)

1. Ryan: **Carriers** -> enter the Ultimate username/password -> Save.
2. Marshall (or Ryan) runs the worker on a machine with a browser (section 9):
   `cd worker && npm run browsers && npm run once`.
3. Click **Sync now** first (the worker only processes requested syncs).
4. New statements appear under **Statements** as "Needs review".
5. If the portal asks for MFA or the markup differs, the connection turns to
   "Needs attention" with a safe error message. See section 9.

> **Never** paste a real statement, member data or portal password into chat,
> an issue, a commit or a test fixture. See [Security](#10-security-and-phi).

---

## 3. Current functionality

**Everyone signed in**
- Dashboard of carrier payments in their own scope (Owner: agency; Manager: self + direct reports; Agent: self).
- **Payments**: carrier-paid transactions by month, with totals by payment category (chargebacks are negative).

**Owner**
- **Statements**: upload a PDF, preview it (new / already imported / needs review / unassigned), approve the import. History of all statements (manual and portal).
- Mark a statement as belonging to an **Independent agent** (every row is then theirs, whatever name is printed).
- **Payments**: assign unassigned payments to a teammate; optionally remember the printed name as an alias.
- **Users**: add/edit teammates with **agent type** (Career + level, or Independent). Owner only.
- **Carriers**: enter the agency's carrier portal login, Sync now, remove login; see Independent agents' connection status.

**Independent agent**
- **Carriers**: enter their own portal login, Sync now, remove login. They are paid directly by the carrier; the app only shows what they were paid, by category.

**Career agent**
- Sees their own payments. The agency handles carrier statements, so there is no login to enter.

**Manager**
- Sees self + direct reports on Dashboard and Payments. No Statements/Carriers.

**Not linked from the menu (legacy, still in the code):** `/commissions`, the
comp-plan/bonus screens in Settings, `/onboarding`. See section 5.

---

## 4. How the data flows

```
 Carrier portal ──(worker, Playwright)──┐
                                        ▼
 Manual upload ───────────────►  private Storage bucket "statements"
                                        │  (PDF kept privately, key = <agency>/<sha256>.pdf)
                                        ▼
                      commission_statements (status: received)
                                        │  Owner opens the statement
                                        ▼
        pdf-parse text ─► carrier parser ─► reconcile totals (throws if off)
                                        ▼
        duplicate planning + writing-agent assignment  ──►  PREVIEW (nothing written)
                                        │  Owner clicks Approve
                                        ▼
          import_statement() — ONE database transaction
                                        ▼
        carrier_transactions (what the carrier paid, signed integer cents)
                                        ▼
           Dashboard / Payments  (RLS-scoped per role)
```

Important properties:
- **Nothing is paid or earned by importing.** Importing records what the carrier paid.
- **Preview is rebuilt on the server at approval time**; the browser is never trusted.
- Parsers **throw** if subtotals/grand total do not reconcile rather than return partial data.
- A row is attributed to a person only when the statement *proves* the writing agent and it matches that person's alias. Anything else stays **Unassigned** for the Owner.

---

## 5. What's missing

**Not built yet**
- GoHighLevel **output** (match contacts, push statuses). Not built: Settings/Onboarding show an informational "Coming soon" card only. GHL is never a source of payable amounts.
- Career-agent **earnings / payout screens**: the rules, rate locks and approval logic exist in `lib/carriers/compensation`, with tables, but no UI and no job that creates earnings. Needs Ryan's rate decisions first (section 7).
- Carriers other than **Ultimate Health Plans** (parser and portal).
- **Scheduled** syncing. The worker only handles "Sync now" requests.
- Auto-import for Independent agents' statements (currently the Owner approves every statement).
- Inviting teammates by email (new users get a temporary password shown to the Owner).
- Hosted deployment of the worker.

**Not built: per-company configuration (needed to sell this as SaaS to other agencies)**

The data model is already multi-tenant (every table carries `agency_id` and has RLS),
but several things are still **TruePlan's model baked in**. None of these is a quick
change, so they are TODOs, deliberately **not** touched while Ryan is testing:
- **Career levels per agency.** "Benefit Consultant / Senior Benefit Consultant / Client Advisor / Private Client Advisor" are TruePlan's titles, hard-coded in database CHECK constraints (migration `0005`: `users.career_level`, `compensation_rules.career_level`, `policy_compensation_locks.career_level_at_write`) and in `types/domain.ts`. Each agency should define its own level names, order, and **what each level can see** (visibility rules). Needs a `career_levels` table per agency, a migration replacing the CHECK constraints, and a settings screen. Existing rate locks must keep their level (non-negotiable rule 2).
- **Compensation rules / percentage plans per agency.** Rules exist only as seeded SQL rows (TruePlan's MAPD fixed-dollar rates, demo only). Each agency needs a screen to create and edit effective-dated rules by level, product and payment category, as **fixed dollars or percent**, without overwriting history.
- **Bonuses on/off per agency.** TruePlan does not use bonuses; other agencies may. Make bonuses an agency setting (off by default). The old bonus code is legacy CRM-driven and must not be reused as is.
- **Payout options per agency.** Payout frequency (biweekly is TruePlan's), whether owner approval is required, and whether payouts are tracked at all. Carrier receipt before payout stays mandatory.
- **Starter setup for a new agency.** Signup still seeds the legacy 10% / 2% / 1% plan and no compensation rules or levels. Onboarding should walk a new owner through levels, rules, bonuses and payouts (replace the old plan step).
- **Carrier and product catalog per agency** (which carriers and products each company uses), and confirming parser assumptions (for example the Ultimate writing-agent codes) hold across companies.
- Any customer-specific value must live in per-agency **data**, never in code (see `.cursorrules`).

**Legacy code still present (CRM-driven model)**
- `commission_plans`, `commission_plan_rates`, bonuses, `commission_transactions`, `lib/commission-engine`, `/commissions`, Settings plan/bonus screens, `/onboarding`, and the inbound GoHighLevel adapter in `lib/crm` (its webhook route and fake "Connect" button were removed 2026-10-10; `crm_connections` table stays). They still work but no longer feed the dashboard. The signup function `create_agency_with_owner` still seeds the old 10% / 2% / 1% plan. Retire these once nothing needs them.

**Known limits**
- Ultimate parser only recognizes the writing-agent layouts proven in Ryan's prototype (`ADV`, `MCC`, `PFS`, `BRP` codes). Other layouts leave the writing agent unverified -> Unassigned.
- Statement tables show at most 300 rows per page (all rows still import).
- No pagination or search on Payments yet. Dashboard/Payments load up to 50,000 payments into memory (read in 1,000-row pages because Supabase caps responses); move the totals into SQL before volumes get near that.

---

## 6. Recommended next steps (in order)

1. **Run the manual flow once** on a real Supabase project with `sample-statement.pdf`, then with one of Ryan's real PDFs. Fix whatever breaks. Nothing else is trustworthy until this is done.
2. **Answer the open decisions** in section 7, especially how Independent agents' production rolls up and how aliases should work.
3. **Run the worker once** with Ryan's Ultimate login on a machine with a browser; fix selector/flow issues.
4. **Keep running locally for now. Do not deploy yet.** Run the app, local Supabase and the worker (`npm run start` in `worker/`) on your own machine. Hosting costs money and real client data (PHI) cannot go on any hosted service until HIPAA agreements are in place. Deploy when you are ready to launch, following the roadmap in section 14 (hosted setup, nightly sync, HIPAA).
5. **Career earnings UI:** show the preview (`buildEarningsPlan`), Owner approval, then payouts. Needs rates and the renewal rules confirmed.
6. **Second carrier:** write a `StatementParser` and a `CarrierPortal` (see section 9).
7. **GoHighLevel output** (reshape `lib/crm` around push operations; no inbound payable data).
8. Retire the legacy CRM-driven code and the old seed data.
9. **Per-company configuration** (section 5, "Not built: per-company configuration"): configurable career levels and visibility, compensation rule/percentage-plan editor, optional bonuses, payout options, new-agency onboarding. Do this before onboarding a second company. Plan it first (it needs a migration, so it requires Marshall's approval per section 13).

---

## 7. Decisions to check with Ryan

Assumptions already built in. Please confirm or correct each:

1. **Overrides** are only for Independent Agency Owners, are **carrier-reported** (never computed), and vary by carrier. *Open:* the Ultimate parser does not yet recognize an OVERRIDE category; what do those lines look like on a real statement?
2. **Owner's own writing is "personal production"**, reported separately from agency production. Is that the right rule?
3. **Independent agents' production**: they are tracked by person only (no agency/personal bucket). Should their production roll up into agency reporting at all?
4. **Name matching**: statement names map to people by exact "First Last" / "Last, First" (case/comma-insensitive). A middle initial or nickname will not match and the row stays Unassigned until the Owner assigns it (with the option to remember that name). If two people share a name, the first one added wins. Is exact matching acceptable?
5. **Payee is not proof of the writer.** A row is only auto-assigned when the statement's writing-agent field is verified. Unverified rows go to review. Agree?
6. **Approval**: the Owner approves every statement import, including Independent agents' own statements. Should Independents' statements auto-import since nothing is paid on them?
7. **Career rates** (MAPD, per sale/renewal, fixed dollars): BC $300 / $100 / $7, SBC $350 / $125 / $10, CA $400 / $150 / $12.50, PCA $450 / $150 / $15 (T65 / plan change / renewal), effective 2026-10-08. Confirm, plus the **non-MAPD products** (currently `NOT_CONFIGURED`, never guessed).
8. **Who sees what** for Managers: self + direct reports. Correct?
9. **Duplicate rule**: two statements that contain economically identical rows (same member/month/type/amount) but different PDFs are held for review instead of imported. Is that the right safety net?
10. **Career agents never enter logins**; only the agency's login is used. Correct for agencies with Career agents?
11. **Which things must each company be able to configure?** Current plan (section 5): career level names and visibility, compensation rules (fixed dollars or percent), bonuses on/off, payout frequency and approval. Anything else other agencies would need (override tiers, split commissions, chargeback rules)? Ask Ryan and any prospective customers.

---

## 8. Setup and environment variables

Prerequisites: Node 20+, Docker Desktop, the [Supabase CLI](https://supabase.com/docs/guides/cli).

```bash
npm install
npx supabase start          # local Postgres/Auth/Storage in Docker (applies migrations)
npx supabase db reset       # re-applies migrations + supabase/seed.sql demo data
cp .env.local.example .env.local
npx supabase status         # copy API URL / anon key / service_role key into .env.local
openssl rand -base64 32     # paste into CREDENTIAL_ENCRYPTION_KEY in .env.local
npm run dev                 # http://localhost:3000
```

| Variable | Used by | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | app, worker | |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | app | |
| `SUPABASE_SERVICE_ROLE_KEY` | app (server only), worker | Bypasses RLS. Never expose to the browser. |
| `CREDENTIAL_ENCRYPTION_KEY` | app (server only), worker | 32 random bytes, base64. **App and worker must use the same value.** Losing it means every saved carrier login must be re-entered. |
| `POLL_INTERVAL_SECONDS` | worker | Optional, default 30. |

Demo logins (all `password123`; created by `supabase/seed.sql`):

| Role | Email | Demo person | Type |
| --- | --- | --- | --- |
| Owner | `owner@commissionflow.dev` | Jane Owner | Independent owner |
| Manager | `manager@commissionflow.dev` | Mike Manager | - |
| Manager | `manager2@commissionflow.dev` | Sara Manager | - |
| Agent | `agent@commissionflow.dev` | Alex Agent | Career, Benefit Consultant |
| Agent | `agent2@commissionflow.dev` | Priya Patel | Career, Senior Benefit Consultant |
| Agent | `agent3@commissionflow.dev` | Chris Nguyen | Career, Client Advisor |
| Agent | `agent4@commissionflow.dev` | Taylor Brooks | Career, Private Client Advisor |
| Agent | `agent5@commissionflow.dev` | Jordan Lee | Independent |

Going live: see **section 14 (Launch roadmap)** for hosting options, costs, step-by-step
setup and the HIPAA requirements. In short: create a hosted Supabase project,
`npx supabase link --project-ref <ref>`, `npx supabase db push`, set the variables
above in Vercel, deploy. **Skip `seed.sql` in production.** Migration `0006` creates
the private `statements` storage bucket.

Commands: `npm run dev | build | test | lint | typecheck | sample:statement`.

---

## 9. Carrier worker (`worker/`)

Logging into a carrier portal needs a real browser, so it **cannot run on
Vercel**. It is a separate small Node package that talks to the same Supabase
database. It only *downloads PDFs* into the private bucket; the web app does
all parsing.

```bash
cd worker
npm install
npm run browsers     # downloads Chromium once
npm run once         # process pending "Sync now" requests and exit
npm run start        # keep polling every POLL_INTERVAL_SECONDS
```

It reads `../.env.local`. How it behaves:
- Picks up connections where an agent clicked **Sync now** (`sync_requested_at`), decrypts the login (AES-256-GCM, bound to the connection id), signs in with a **fresh browser each run** (no saved sessions), downloads statements it has not seen, stores them, and registers them as "Needs review".
- An **Independent** agent's connection tags statements as theirs; the **Owner's** connection produces agency statements.
- On a login problem, MFA prompt, or portal change the connection becomes **Needs attention** with a safe message (no URLs, selectors or credentials).
- Selectors live only in `worker/src/carriers/ultimate.ts` (ported from Ryan's prototype; **unverified** here).

Adding a carrier: implement `StatementParser` (`lib/carriers/types.ts`, register in `lib/carriers/index.ts`) **and** `CarrierPortal` (`worker/src/carriers/types.ts`, register in `worker/src/carriers/registry.ts`). The carrier name string must be identical in both.

TODO: nightly scheduled syncs; MFA handling; monitoring/alerts.

---

## 10. Security and PHI

- Commission statements are **PHI**. No real client data in the repo, fixtures, tests, logs, screenshots or chat. All fixtures and `sample-statement.pdf` are synthetic. `.gitignore` excludes databases, statement folders and session files.
- Carrier passwords are encrypted before storage, never returned to the browser, never logged, and stored in a table that browser-facing roles cannot read.
- Statement PDFs live in a **private** storage bucket with no public/authenticated policies; only server code (service role) can read them.
- Multi-tenancy and role scoping are enforced by Postgres RLS, not only by the UI. Financial tables are written only by server code after a role check.
- Ryan's original prototype contained real data and a saved session file. Rotate that Ultimate password, and never copy that data here.
- TODO: CRM tokens (legacy) are still plaintext; consider Supabase Vault for credentials.

---

## 11. Project structure

```
/app/(dashboard)
  dashboard/        carrier-payment dashboard (all roles)
  payments/         carrier payments, categories, assign (Owner)
  statements/       upload + history + [id] preview/approve (Owner)
  carriers/         carrier login + sync status (Owner, Independent agents)
  users/            team + agent type/level (Owner/Manager)
  settings/         legacy plans/bonuses/CRM + team add
/components         ui/ primitives; dashboard/, statements/, payments/, carriers/, users/
/lib
  carriers/         PURE carrier logic: parsers, money, duplicate planning, assignment,
                    preview, sample statement, compensation (rate locks, earnings plan)
  pdf/              PDF text extraction (pdf-parse 1.1.1, pinned on purpose)
  crypto/           credential encryption (no app imports; worker reuses it)
  services/         orchestration: stored PDF -> preview -> import
  repositories/     ALL database access (supabase-js)
  reporting/        pure aggregation (carrierMetrics.ts; metrics.ts is legacy)
  auth/             session, role guards, agent-type validation, carrier-login access rule
  commission-engine/, crm/   LEGACY CRM-driven model
/worker             separate package: Playwright portal pull
/supabase           migrations/ (0001-0006), seed.sql
/types              hand-written schema + domain types
/scripts            make-sample-statement.ts
```

Layering: UI -> server actions -> services -> repositories (database) and
`lib/carriers` (pure rules). Business rules never import UI, and carrier
parsing never touches the database.

Migrations: `0001` base schema/RLS, `0002` grants, `0003` comp plans (legacy),
`0004` onboarding, `0005` carrier statements/compensation model, `0006` statement
import function + storage bucket + sync request column.

`types/database.ts` is hand-written; regenerate with
`supabase gen types typescript --linked` once linked to a real project.

---

## 12. Verification log

Last full run (2026-10-08): `vitest` 113 tests passing, `tsc` clean (app and
worker), `eslint` clean, `next build` succeeds. SQL behavior verified on a
throwaway Postgres 14 (not Supabase). **Not verified:** any screen against live
Supabase/Auth/Storage, the worker against the live portal, any real PDF.

Known quirk: `pdf-parse` 1.1.1 fails on PDFs smaller than about 4 KB (buffer-pool
offset bug). Real statements are much larger; only hand-made test PDFs are affected
(the test fixture pads itself for this reason).

---

## 13. Contributing (version control process)

**For Ryan and his AI assistant: follow this every time you change the project.**
Repo: `https://github.com/mrro253/ComFlow` (remote `origin`). The main branch is
named **`Main`** (capital M). Do not fork; work on branches in this same repo.
Pull requests are **not required**. Marshall reviews after the fact.

### Daily workflow

Use one branch per feature or fix. Never commit straight to `Main`.

```bash
# 1. Start from the latest Main
git checkout Main
git pull

# 2. Make a branch for the feature (lowercase, hyphens)
git checkout -b feature/short-description

# 3. Work, then check it (all three must pass before merging)
npx tsc --noEmit
npx eslint app components lib
npx vitest run

# 4. Commit with a meaningful message (see below)
git add -A
git commit -m "Add carrier selector to the Statements upload page"

# 5. Push the branch (this does NOT change Main)
git push -u origin feature/short-description

# 6. When the feature is finished and the checks pass, merge it into Main
git checkout Main
git pull
git merge feature/short-description
git push
```

- Pushing a branch only creates that branch on GitHub. Nothing reaches `Main`
  until step 6. GitHub will not open a pull request on its own.
- Commit small and often on the branch. Push the branch at the end of each
  work session so Marshall can see it.
- If `git merge` reports **conflicts**, or anything else looks wrong, **stop and
  ask Marshall**. Do not force anything.
- Never use `git push --force`, `git reset --hard` on shared work, or delete
  `Main`.

### Commit messages

Say what changed and why it matters, in plain English, present tense.
Good: `Add Ultimate override line parsing and tests`.
Bad: `update`, `fix stuff`, `wip`, `changes`.

### What you can do on your own vs. what needs Marshall

You can merge on your own when the change is **new functionality or a fix that
fits the existing architecture and stack**: new screens, new carrier parsers,
new reports, copy changes, tests.

**Ask Marshall first** (do the work on a branch and push it, but do not merge) if the
change would:
- add or replace a library, framework, or hosting service
- change the layering (UI -> server actions -> services -> repositories, pure logic in `lib/carriers`)
- change the business rules in `.cursorrules` (carrier-driven commissions, no pay without carrier receipt AND owner approval, integer cents, locked rates, RLS)
- alter or remove existing database tables, or touch money, RLS or audit tables in a way that changes meaning
- make browser automation run anywhere other than the `worker/` service

### Rules every change must follow

1. **README updates ship with the change.** Update the affected sections (status, functionality, missing, next steps, decisions, setup) and add a line to the Changelog with the date, in the same commit.
2. **Never mark something as working unless it was actually run.** Mark unrun things "unverified".
3. **Database changes are new migration files** in `supabase/migrations/`, never edits to old ones. Use the next number. If someone else already used that number, rename yours to the next free one before merging.
4. **No real client data, ever.** Statements and member data are PHI: no real PDFs, names, member IDs or screenshots in the repo, commit history, tests, fixtures or logs. Use synthetic data only (`npm run sample:statement`).
5. **No secrets in the repo.** Logins, API keys and `CREDENTIAL_ENCRYPTION_KEY` live only in `.env.local` (gitignored). Never paste them into chat, issues or commits.
6. **Business logic is pure and tested.** Add Vitest tests for any new calculation or parsing logic.
7. **Money is integer cents.** No floating-point money math.

### Reviewing (Marshall)

Pull requests are optional. To review a pushed branch without one:

```bash
git fetch
git log Main..origin/feature/short-description --oneline
git diff Main...origin/feature/short-description
```

An AI assistant can review that diff on request. If a pull request is ever
wanted, open one on GitHub from the branch into `Main`.

### Prompt to give an AI assistant

> Read `README.md` (especially section 13) and `.cursorrules` before changing
> anything. Work on a new `feature/...` branch, follow the checks and README rules,
> and only merge into `Main` if the change needs no approval under "What you can do
> on your own". Otherwise push the branch and tell me.

---

## 14. Launch roadmap: local -> small test -> full launch

> **Prices and plan rules** below were looked up on vendors' public pages on
> 2026-10-10 and change often. Re-check before buying. **None of the hosted setup
> in this section has been done or run yet** (unverified). **This is not legal advice.**
> Have a healthcare/privacy attorney confirm the HIPAA section.

### 14.1 The stages

| Stage | Where it runs | Data allowed | Approx. cost | Who |
| --- | --- | --- | --- | --- |
| **0. Local dev (now)** | Your laptop: `npm run dev`, local Supabase (Docker), worker in a terminal | Synthetic only | $0 | Marshall |
| **1. Hosted test** | Free-tier hosting with a shareable URL | **Synthetic only** | $0-35/mo | Marshall + Ryan |
| **2. Real-data pilot** | Option 2A: Ryan runs it locally. Option 2B: hosted with HIPAA agreements | Real PHI **only** after the 14.5 checklist | 2A: $0. 2B: about $1,500-1,600/mo | Ryan + Marshall |
| **3. Full launch** | 2B stack, scaled up, plus nightly syncs and monitoring | Real PHI for paying customers | about $1,600-2,500+/mo plus legal/insurance | Everyone |

**Hard rule: no real client data on any hosted service until the 14.5 checklist is complete.**
A hosted service without a signed agreement (BAA) and the right plan is a HIPAA violation, even for "just testing".

Do not move to the next stage until the exit criteria hold:
- **0 -> 1:** a real Ultimate PDF imports correctly on a local run, and the worker pulls once with Ryan's login (section 6, steps 1-3).
- **1 -> 2:** hosted app works end to end with `sample-statement.pdf`; Ryan has answered the section 7 questions.
- **2 -> 3:** pilot ran for a few statement cycles with matching totals; HIPAA package (14.5) done; the pre-launch engineering list (14.6) is done.

### 14.2 Stage 1: hosted test with synthetic data (cheapest)

| Piece | Service | Plan | Cost |
| --- | --- | --- | --- |
| Web app | Vercel | Hobby (free; meant for personal / non-commercial use, check their terms) | $0 |
| Database, auth, storage | Supabase | Free (500 MB, **pauses after 1 week of inactivity**) or Pro | $0 or $25/mo |
| Carrier worker | Not hosted. Run `npm run start` on your machine, or skip (upload sample PDFs manually) | | $0 |

Use a Supabase project that only ever holds synthetic data. Because the worker is not
hosted, never point a hosted app at a real carrier login in this stage.

### 14.3 Stage 2 and 3: hosted with PHI (HIPAA-capable stack)

All three vendors below will sign a BAA, but only on specific paid plans:

| Piece | Service | Plan needed for a BAA | Cost |
| --- | --- | --- | --- |
| Database, auth, storage | **Supabase** | Team plan **plus** the HIPAA add-on. Free and Pro cannot hold PHI. Also requires Point-in-Time Recovery (needs at least Small compute), SSL enforcement, network restrictions and Postgres connection logging | Team $599 + HIPAA $350 + PITR $100 (7 days) + Small compute ~$15 (the plan includes $10 of compute credit) = **about $1,060/mo** |
| Web app | **Vercel** | Pro plan plus the HIPAA BAA add-on (self-serve click-through in Settings -> Billing). Enterprise gets a negotiated, signed BAA | Pro $20 (includes 1 seat and $20 usage credit) + HIPAA $350 = **about $370/mo**, +$20 per extra paid seat |
| Carrier worker (Chromium) | **Fly.io** | Any paid plan plus the HIPAA package, BAA pre-signed (you sign it to activate) | HIPAA package $99 + machine (`shared-cpu-1x` 1 GB $6.70, 2 GB $12.70) = **about $106-112/mo** |
| **Total** | | | **about $1,540/mo (about $18,500/yr)** |

Almost all of this is HIPAA-driven, not usage: about $800/mo is the HIPAA add-ons, and
the $599 Team plan is only needed because Supabase requires it for HIPAA. That fixed
cost matters when pricing CommissionFlow to customers.

Alternatives considered:
- **Render** HIPAA workspaces need the Scale plan ($499/mo) plus a 20% usage surcharge. **Railway** needs a $1,000/mo committed-spend tier for a BAA. Both cost more than Fly for the worker.
- **One AWS account for everything.** AWS's BAA is free to accept (AWS Artifact), and EC2, RDS and S3 are HIPAA-eligible, so this is cheaper at scale. But it means leaving Supabase (auth, storage, RLS, supabase-js) and hosting Postgres yourself, which is a rewrite. Self-hosted Supabase is not covered by Supabase's HIPAA program. Keep as a **future cost-reduction option**, not for the pilot.
- **Option 2A (cheapest real-data pilot): no cloud at all.** For the first customer (TruePlan), Ryan runs the app, local Supabase and worker on a company computer with full-disk encryption (FileVault or BitLocker), a login password and no sharing. PHI then stays inside the customer's own environment, under their existing carrier agreements. Cost $0, but only that machine can use it and Marshall never sees real data. A pilot-only option for the first customer; it does not scale to other companies.

### 14.4 How to set up the hosted stack

Do these in order. Use Stage 1 plans for synthetic testing and the Stage 2 plans (14.3) for real data.

**A. Supabase (database)**
1. Create an account at supabase.com, then an organization on the plan you need and a project in a US region. Save the database password in a password manager.
2. `npx supabase login`, then `npx supabase link --project-ref <ref>` and `npx supabase db push`. **Do not run `seed.sql` in production** (it creates demo users with a known password).
3. Authentication -> URL configuration: set the Site URL to your Vercel URL and add it to the redirect list. Decide whether public sign-up should stay open (it creates a new agency); for a pilot, turn it off and create the Owner account yourself.
4. Copy the API URL, the publishable (anon) key and the secret (service-role) key from Project Settings -> API.
5. For PHI: add the HIPAA add-on, get the BAA signed through Supabase (they use a contact form), then turn on **High Compliance** under Project Settings -> General and follow the checks in the Security Advisor.
6. Confirm migration `0006` created the private `statements` bucket.

**B. Vercel (web app)**
1. Sign up at vercel.com with GitHub, then Add New -> Project -> import `mrro253/ComFlow`.
2. Project Settings -> Git: set **Production Branch to `Main`** (capital M; Vercel often defaults to `main`). Merging into `Main` then deploys automatically, and every branch gets a preview URL.
3. Add environment variables (section 8): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `CREDENTIAL_ENCRYPTION_KEY` (generate a **new** one for production; never reuse your local key).
4. **Scope the variables:** set the Preview environment to a synthetic-data Supabase project. Preview deployments of feature branches must never connect to the project holding PHI.
5. Add a custom domain when ready, then update the Supabase Auth URLs.
6. For PHI: Pro plan plus the HIPAA BAA add-on (Settings -> Billing).
7. Known limit: Vercel caps request bodies at about 4.5 MB (verify), below our 10 MB upload setting. Large statement PDFs will need direct-to-storage uploads (14.6).

**C. Fly.io (carrier worker)**
1. The worker has **no Dockerfile yet**. Write one based on Microsoft's Playwright image (it includes Chromium), then confirm the worker reads environment variables when there is no `.env.local` (unverified).
2. Install `flyctl`, `fly auth signup`, then `fly launch` inside `worker/`. Set `[[vm]]` to `shared-cpu-1x` with 1-2 GB (Chromium needs the memory) and make sure one machine is always running (no auto-stop).
3. `fly secrets set NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... CREDENTIAL_ENCRYPTION_KEY=...` (same encryption key as Vercel, or saved carrier logins will not decrypt), then `fly deploy`.
4. For PHI: buy the HIPAA package and sign the BAA at fly.io/compliance **before** pointing it at real carrier logins.
5. Once it is up, "Sync now" works from the web UI with no command line.

**D. Nightly sync (not built)**
TODO: add a small scheduler to the worker that, once a day, sets `sync_requested_at` for each active connection so the normal polling loop pulls new statements. Only worth building after the worker is hosted.

### 14.5 HIPAA: what we need, with whom, and how

**Why it applies.** Commission statements contain member names, policy details and carrier data, which is PHI. Carriers are HIPAA "covered entities". Agencies and agents who receive PHI from carriers on the carriers' behalf are typically treated as **business associates**, and carrier broker agreements usually include a BAA addendum for this (Medica and Fallon Health publish theirs). A business associate must get a written BAA from any subcontractor that handles that PHI. That includes CommissionFlow, and then every hosting vendor CommissionFlow uses.

CommissionFlow is sold to **many companies** (TruePlan FL Inc. is only the first), so every
agreement below repeats **per customer**. Build one standard set of paperwork and reuse it.

**The chain of agreements** (the pattern to confirm with an attorney). "Customer" means an
agency or an Independent agent using CommissionFlow:

| # | Agreement | Between | Status / how to get it |
| --- | --- | --- | --- |
| 1 | Carrier contract + BAA addendum | Each carrier <-> each customer (agency or Independent agent) | Already exists as part of the customer's carrier contracting. **Each customer must read theirs** for rules on subcontractors and vendors, offshore data, breach-notice timing, and whether automated portal access is allowed. Contracts differ by customer and carrier |
| 2 | **BAA** | Each customer <-> **CommissionFlow** (Marshall's company) | Needed before that customer's PHI touches a hosted CommissionFlow. Have the attorney draft **one standard customer BAA** (include terms for returning or deleting a customer's PHI when they leave, and breach notice to the affected customer) and sign it at onboarding |
| 3 | **BAA** | CommissionFlow <-> **Supabase** | Team plan + HIPAA add-on, then sign via Supabase |
| 4 | **BAA** | CommissionFlow <-> **Vercel** | Pro + HIPAA add-on (click-through) |
| 5 | **BAA** | CommissionFlow <-> **Fly.io** (or AWS) | Fly HIPAA package, or AWS free BAA through AWS Artifact |
| 6 | BAA with any other vendor that could ever see PHI | e.g. email, error monitoring, log tools, support tools, analytics | Avoid: do not send PHI to such tools. If one must, get a BAA first |
| - | No BAA needed | GitHub (code only), as long as no PHI is ever committed | Enforced by the rules in section 13 and 10 |

Each Independent-agent customer is their own business associate of their carriers, so they also need agreement #2 with CommissionFlow.

**Multi-customer items to plan for:**
- Keep a **subprocessor list** (Supabase, Vercel, Fly.io) to give customers, and notify them when it changes.
- **Tenant isolation is a HIPAA safeguard.** The row-level security that keeps one agency's data from another (and one agent's from another) should get independent testing before launch.
- **Onboarding checklist per customer:** signed BAA, customer confirms their carrier contracts allow this vendor and automated portal access, admin account created.
- **Offboarding:** return or delete the customer's PHI on request or termination, and record when it was done.
- **Pricing:** the HIPAA hosting stack is a fixed cost shared by all customers, so each added customer lowers the cost per customer.

**Steps, in order**
1. **Form a legal entity** for CommissionFlow (LLC or similar), so agreements are signed by a company, not you personally. Get business insurance, ideally cyber liability and E&O. Ask an attorney or insurer about it.
2. **Hire a healthcare/privacy attorney** (one-time review; get a fixed quote). Ask them to: confirm the agreement chain above, draft the customer BAA, review the first customer's (TruePlan's) carrier contracts for restrictions, and review the breach-notification laws of the states you will serve (Florida's FIPA first), which also apply.
3. **Ask Ryan for TruePlan's carrier agreements** and check each carrier's portal terms of use for automated (robot) access. Some carriers forbid it. Repeat this check for each new customer and carrier.
4. **Complete the HIPAA Security Rule basics** (a lightweight version is fine at this size), written down:
   - a **risk assessment** (what PHI we hold, where, and the risks)
   - written **policies**: access control, encryption, data retention/deletion, incident response and breach notification, backup and recovery
   - **workforce training** and a signed confidentiality agreement for anyone with access (you, Ryan, any contractors)
   - an **access review** schedule and a breach-response contact list
5. **Sign vendor BAAs** (rows 3-5) and enable each vendor's HIPAA settings **before** any real data is uploaded.
6. **Sign the customer BAA** (row 2) with the first customer (TruePlan), then with each new customer at onboarding.
7. **Only then** upload real data, starting with one real PDF and checking nothing leaks (logs, error messages, previews).
8. Keep records: signed agreements, the risk assessment, and the training log, for at least 6 years (HIPAA documentation rule).

**Ways to reduce risk and scope** (design ideas, not built):
- Store less PHI: if the app does not need full member names or IDs for reports, keep initials or a short ID and drop the rest. Needs Ryan's answer on what he actually needs.
- Require MFA for all users (Supabase Auth supports it), plus an idle-session timeout.
- Keep PHI out of logs and error messages. The worker and app already avoid logging statement contents; keep it that way.

### 14.6 Pre-launch engineering checklist (before Stage 2B and 3)

- [ ] Worker Dockerfile; worker runs on its host with env variables only
- [ ] Nightly sync scheduler (14.4 D)
- [ ] Direct-to-storage PDF upload (avoids Vercel's body limit)
- [ ] MFA and session timeout for users
- [ ] Decide on public sign-up (off for pilot)
- [ ] Monitoring and alerts for the worker and failed syncs (without PHI in the alert text)
- [ ] Backup and restore drill (restore into a scratch project and check totals)
- [ ] Rotate Ryan's old Ultimate password (it was in his prototype) and use new production keys
- [ ] Remove demo seed users, retire the legacy CRM-driven code
- [ ] Error pages and logs checked for PHI leaks
- [ ] Real Ultimate PDF and worker pull verified locally (section 6 steps 1-3)

---

## 15. Changelog (newest first)

- **2026-10-10** - Multi-company framing: TruePlan is the first customer, not the only one. Documented per-company configuration TODOs (career levels and visibility, compensation/percentage plans, optional bonuses, payout options, new-agency onboarding) in sections 5-7; made section 14.5 (HIPAA) per-customer. Docs and rules only; no code or schema changes.
- **2026-10-10** - Added section 14 "Launch roadmap" (stages local -> hosted test -> real-data pilot -> launch, hosting options and prices, setup steps for Supabase/Vercel/Fly.io, HIPAA agreements and steps, pre-launch checklist). Reworded next step #4: keep running locally, deploy only when ready to launch.
- **2026-10-10** - Added section 13 "Contributing" (branch workflow, merge rules, what needs Marshall's approval) and a matching "GIT WORKFLOW" block in `.cursorrules`.
- **2026-10-10** - GoHighLevel is output-only: removed the inbound CRM webhook route (`/api/webhooks/crm`) and the stub "Connect GoHighLevel" action; CRM card is now an informational "Coming soon" card. tsc, eslint and vitest (113) pass.
- **2026-10-08** - MVP statement flow: upload/preview/approve import, Payments, Carriers (encrypted logins + Sync now), carrier-based dashboard, agent type/level in Users, carrier worker (unverified), `import_statement` + storage bucket migration (`0006`), sample statement generator, README rewritten as a living handoff document.
- **2026-10-08** - Merged Ryan's carrier-statement logic: Ultimate parser, duplicate planning, writing-agent classification, rate locks and earnings plan (pure logic + tests), migration `0005`, `.cursorrules` rewritten for the statement-driven model.
- Earlier - CRM-driven MVP (auth, roles, comp plans, bonuses, GoHighLevel scaffold). Now legacy.
