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

Last updated: 2026-10-08

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
- GoHighLevel **output** (pushing results to the CRM). Only the old input scaffold exists.
- Career-agent **earnings / payout screens**: the rules, rate locks and approval logic exist in `lib/carriers/compensation`, with tables, but no UI and no job that creates earnings. Needs Ryan's rate decisions first (section 7).
- Carriers other than **Ultimate Health Plans** (parser and portal).
- **Scheduled** syncing. The worker only handles "Sync now" requests.
- Auto-import for Independent agents' statements (currently the Owner approves every statement).
- Inviting teammates by email (new users get a temporary password shown to the Owner).
- Editing compensation rules in the UI (they are seeded SQL rows).
- Hosted deployment of the worker.

**Legacy code still present (CRM-driven model)**
- `commission_plans`, `commission_plan_rates`, bonuses, `commission_transactions`, `lib/commission-engine`, `/commissions`, Settings plan/bonus screens, GoHighLevel webhook, `/onboarding`. They still work but no longer feed the dashboard. The signup function `create_agency_with_owner` still seeds the old 10% / 2% / 1% plan. Retire these once nothing needs them.

**Known limits**
- Ultimate parser only recognizes the writing-agent layouts proven in Ryan's prototype (`ADV`, `MCC`, `PFS`, `BRP` codes). Other layouts leave the writing agent unverified -> Unassigned.
- Statement tables show at most 300 rows per page (all rows still import).
- No pagination or search on Payments yet. Dashboard/Payments load up to 50,000 payments into memory (read in 1,000-row pages because Supabase caps responses); move the totals into SQL before volumes get near that.

---

## 6. Recommended next steps (in order)

1. **Run the manual flow once** on a real Supabase project with `sample-statement.pdf`, then with one of Ryan's real PDFs. Fix whatever breaks. Nothing else is trustworthy until this is done.
2. **Answer the open decisions** in section 7, especially how Independent agents' production rolls up and how aliases should work.
3. **Run the worker once** with Ryan's Ultimate login on a machine with a browser; fix selector/flow issues.
4. **Deploy:** Vercel for the app, a hosted Supabase project, and a small always-on host for the worker. Then add a nightly sync.
5. **Career earnings UI:** show the preview (`buildEarningsPlan`), Owner approval, then payouts. Needs rates and the renewal rules confirmed.
6. **Second carrier:** write a `StatementParser` and a `CarrierPortal` (see section 9).
7. **GoHighLevel output.**
8. Retire the legacy CRM-driven code and the old seed data.

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

Going live: create a hosted Supabase project, `npx supabase link --project-ref <ref>`,
`npx supabase db push`, set the variables above in Vercel, deploy. **Skip
`seed.sql` in production.** Migration `0006` creates the private `statements`
storage bucket.

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

## 13. Changelog (newest first)

- **2026-10-08** - MVP statement flow: upload/preview/approve import, Payments, Carriers (encrypted logins + Sync now), carrier-based dashboard, agent type/level in Users, carrier worker (unverified), `import_statement` + storage bucket migration (`0006`), sample statement generator, README rewritten as a living handoff document.
- **2026-10-08** - Merged Ryan's carrier-statement logic: Ultimate parser, duplicate planning, writing-agent classification, rate locks and earnings plan (pure logic + tests), migration `0005`, `.cursorrules` rewritten for the statement-driven model.
- Earlier - CRM-driven MVP (auth, roles, comp plans, bonuses, GoHighLevel scaffold). Now legacy.
