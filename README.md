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

Last updated: 2026-11-10 (README accuracy sweep against `Main` as of the 2026-10-21 changelog entries; `Main` has no commits after 2026-10-21)

> **Changing code? Read section 13 (Contributing) first.** Work on a branch, never directly on `Main`.
>
> **Looking at unmerged branches? Read section 16 (Unmerged branch review register).** Nothing listed there should be merged without Marshall's review.

---

## 1. Status at a glance

**"Verified locally"** means exercised on this project's *local* Supabase (Docker) with the
app in a browser and/or synthetic tests. **Nothing has been run against a hosted Supabase
project, Vercel, or a hosted worker** (section 14). All automated checks currently pass on `Main`:
**393 Vitest tests in 55 files**, app and worker TypeScript, ESLint and `next build`
(last recorded 2026-10-21).

| Area | State | How it was checked |
| --- | --- | --- |
| Ultimate Health Plans PDF parsing + reconciliation | Locally verified | Synthetic fixtures plus nine real Ultimate PDFs parsed and imported locally on 2026-10-20 (94 entries). Other Ultimate layouts remain unverified. |
| UnitedHealthcare (UHC) renewal PDFs | Limited layout locally verified | [Supported layout and mapping](docs/uhc-import.md). Eight saved statements imported (46 entries / 133,032 cents, all assigned). August and October were downloaded by Sync now and await review/import (6 entries / 17,352 cents). Other layouts unsupported. |
| Devoted Health paired PDF + workbook | Limited layout locally verified | [Activation and recovery notes](docs/devoted-import-live.md). Nine pairs imported (9 entries / 26,019 cents). Ryan explicitly overrode the pending approval gate; **Marshall has not approved it.** Other layouts unsupported. |
| Carrier worker (Playwright auto-pull) | Locally verified, Sync now only | Ultimate and Devoted automatic saved-login sync passed live on 2026-10-21. UHC password step is accepted manually; UHC automatic credential acceptance is **not** verified (details in section 9). Scheduling and hosted worker are unbuilt. |
| Atomic import (`import_statement`), duplicate protection, corrections/Superseded | Locally verified | SQL regressions on local Postgres/throwaway Postgres 14, plus [synthetic three-carrier repeat/correction tests](docs/import-regression-tests.md). Browser correction flow unverified. |
| Database schema, RLS, immutability triggers (migrations 0001-0011) | Locally verified | `supabase/tests/role_access.sql` (nine synthetic users, two agencies, rollback-only) passed 2026-10-21. |
| Commission activity (`/payments`): search, filters, pagination, client details dialog, product types | Locally verified | Owner browser flow on all saved entries. Career, Independent and Manager populated flows verified in an isolated synthetic environment on 2026-10-21. Captive and Independent owner-profile browser flows **unverified**. |
| Dashboard (month selector, totals, categories, production groups, carrier-stacked monthly chart) | Locally verified (owner) | Owner browser flow and mobile navigation reviewed. Phone chart, empty/error screens and other role flows unverified. A redesigned filter-panel dashboard is being built on a separate branch (section 5). |
| Statements coverage by year/carrier/owner | Built | Synthetic tests and build. Browser flow unverified. |
| Statement review (PDF viewer, Superseded, unmatched writing agents, payee ID) | Built; import path locally verified | Unit tests + SQL regressions; real statements went through upload/preview/approve locally. The View PDF, Superseded and unmatched-agent screens are not separately recorded as browser-verified. Payee ID position on a real statement is still an assumption (section 7). |
| Captive / LOA agents (migration 0008) | Built | Unit tests and SQL/RLS tests. Browser login as a captive agent **unverified**. |
| Per-agency compensation settings (migration 0009) | Built | Unit tests and SQL. Compensation screens not browser-verified in the changelog. |
| Independent collective report + owner-level profile (migration 0010) | Built | Unit tests and SQL. Owner-profile browser flow **unverified**. |
| Carrier login screen (encrypted credentials) | Locally verified | Encryption unit-tested; owner connection cards for Ultimate, Devoted and UHC checked in a browser. |
| Career-agent earnings, rate locks | Logic built, **no UI** | Unit tests. Payout batches removed. Not in the MVP screens. |
| GoHighLevel output | Plan only | [Field mapping and review plan](docs/ghl-integration-plan.md). No API access and no live GHL changes on `Main`. |

---

## 2. Next session together (Marshall + Ryan)

This is a walkthrough for confirming the product with Ryan. Parts of it have already
been run locally (see section 1); sections C and D were done once on 2026-10-20 with
Ryan's real Ultimate statements and login. Nothing has run on a hosted Supabase project.

**Before you sit down (Marshall)**

```bash
npx supabase migration up --local    # applies any pending migration (through 0011); keeps existing data
# If you would rather wipe local data and re-seed: npx supabase db reset
npm run dev
```

Do **not** use `db reset` if you already have imported statements you want to keep.

### A. One-time setup (if this machine is new)

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
6. **Dashboard**: pick a statement month and see commission totals, the monthly
   carrier-stacked chart, categories, and "where it came from"
   (the owner's personal production is shown separately from the agency's).
7. Sign in as `agent2@commissionflow.dev` (Priya, Career) and confirm she only
   sees her own payment. Try uploading the same file again: it is recognized
   as a duplicate.

### C. Test with a real PDF (done locally 2026-10-20; repeat for each new customer or layout)

1. Ryan signs in as Owner and uploads a real Ultimate statement.
2. **Expected failure mode:** if the PDF layout differs from what the parser
   expects, the upload shows "could not be processed" and **imports nothing**
   (the parser refuses to guess when the numbers do not add up). Send Marshall
   the error text, **not the PDF** (it contains client data).
3. Check that statement total, category subtotals and the number of payments
   match the PDF. Check that every writing agent is attributed correctly.
4. In **Users**, make sure each person is typed (Career + level, or
   Independent) so names on the statement can be matched.

### D. Test a carrier login (done locally for Ultimate, Devoted and UHC; repeat per customer)

1. Ryan: **Carriers** -> enter the Ultimate username/password -> Save.
2. Marshall (or Ryan) runs the worker on a machine with a browser (section 9):
   `cd worker && npm run browsers && npm run start` (or `npm run once`).
3. Click **Sync now** first (the worker only processes requested syncs).
4. New statements appear under **Statements** as "Needs review".
5. If the portal asks for MFA or the markup differs, the connection turns to
   "Needs attention" with a safe error message. See section 9.

### E. Confirm the new review features (synthetic or real PDF)

1. **View PDF** on the statement page. Confirm it opens the original and that
   the numbers match the preview.
2. Upload the **same file again**: it should be recognized as already imported
   (same bytes). Upload a same-named file with **different** payments: it should
   be offered as the corrected version; after approve, the old one is
   **Superseded** (still openable, not in Dashboard/Payments/Reports).
3. A writing-agent name that is **not on the team** should appear under
   "Writing agents to match". Create the agent or assign an existing teammate
   and confirm later statements remember the match.
4. Two teammates with the **same name**: without a payee ID the row stays
   unmatched. Add the payee ID on the user and confirm it breaks the tie.
   **Confirm with Ryan** where the payee ID sits on a real Ultimate row (we
   assumed the `W####` right after `ADV/MCC/PFS/BRP`).

### F. Confirm Captive / LOA agents

1. In Users, add a Captive agent and pick a principal (Career or Independent).
2. Import a statement whose writing agent is that captive name. The payment
   should be **credited to the principal**; Payments should show **Written by**
   the captive agent.
3. Sign in as the captive agent: they see the payments they wrote, including
   the **carrier-paid dollar amounts**. **Confirm with Ryan** whether that is
   acceptable (it reveals the principal's margin) or whether they should see
   counts only.
4. Confirm a captive cannot be someone else's principal, and cannot enter a
   carrier login.

### G. Confirm Compensation settings

1. Open **Compensation** (also in onboarding). Confirm TruePlan's four demo
   levels and MAPD rates are there after a seed/reset.
2. Add a level, change visibility, turn one off. Confirm you cannot rename a
   level.
3. Add a **percent of annual premium** rate (e.g. FINAL_EXPENSE / FIRST_YEAR /
   75%). Confirm a later rate for the same key closes the previous one the day
   before. Confirm the seeded MAPD dollars match what Ryan wants, or change them.
4. Toggle **Bonuses** on/off. Note: this only records the choice; bonus amounts
   are not calculated from statements yet.
5. Confirm there is **no payouts** screen.

### H. Confirm Independent reports and owner-level profile

1. Sign in as `agent5@commissionflow.dev` (Jordan, Independent, owner-level
   profile in the seed). Confirm they see **Statements** and **Reports**, and
   can upload a statement that is attributed only to them.
2. Sign in as a regular Independent (or turn Jordan's flag off) and confirm
   they do **not** see Statements, but they **do** see Reports and can
   **Download CSV**.
3. As Owner, open Reports, pick a month range, download the CSV. Confirm
   superseded statements are not in it.

### Decisions still open (ask Ryan)

See section 7 for the full list. The ones that still need an answer:

- Where is the **payee ID** on a real Ultimate statement?
- Should a **captive agent see dollar amounts**?
- How should Career-agent visibility work **"up the hierarchy"** (today:
  Managers see self + direct reports; a Career level can be set to
  `direct_reports`)?
- Where will **annual premium** come from for percent rules?
- Confirm the seeded **TruePlan MAPD rates** and level names, or change them
  on Compensation.

> **Never** paste a real statement, member data or portal password into chat,
> an issue, a commit or a test fixture. See [Security](#10-security-and-phi).

---

## 3. Current functionality

What the app does on `Main` today, by role. How it was checked is in section 1 and the
verification log in section 12.

**Everyone signed in**
- **Commission terminology:** `/payments` is labeled **Commission activity**. Counts on this page, Dashboard, Reports and statement review mean **commission entries** (client-level statement lines), not bank deposits. **Commission total** is the signed sum of matching entries; it can differ from the carrier's statement total because of filters or carried balances. Statement totals retain their original label. One carrier payment can cover several entries; the app does not verify bank deposits. No calculations or financial records changed.
- **Product type** is separate from payment category. The dropdown includes dental, vision, hearing, combined DVH, Medicare Advantage, prescription drug, Medicare supplement, life insurance, final expense, annuity, Other and Unknown. These are shared reporting groups, not agency compensation products or rates. Final expense and bundled DVH have distinct filters; no component split is invented.
- **Confirmed carrier product mapping:** Ryan confirmed on 2026-10-21 that Ultimate only offers MAPDs. Ultimate payments therefore report **Medicare Advantage (MAPD)** even though these PDFs have no product column. The details dialog identifies this as carrier evidence, not an extracted PDF field. Other carriers need a verified adapter/mapping or an explicit Product/Product type/Product category/Line of business field; names, prior plan, notes, payment category and amount are never used to guess a product. An explicit source product that conflicts with a confirmed mapping stays Unknown for review. Unrecognized but explicitly stated products retain their value under Other. No commission rows, rate locks or compensation rules are changed.
- **Payment statement details**: client name appears in Payment detail. Click the client name to open a keyboard-accessible details dialog containing all 13 printed Ultimate columns (UHC shows 18 source-detail fields and Devoted 24), including first/last name, Medicare identifier as printed, carrier member ID, effective date, writing agent, UCAIN, payee ID/name, amount/category, prior plan and notes, plus source filename/row. Blank fields say "Not provided"; unsupported or unverifiable source rows say "Source details unavailable". All 94 locally imported payments were checked against their saved sources on 2026-10-20.
- Details are read from the saved private PDF after session/RLS authorization and exact source-hash, transaction-key, member, date, amount and category checks. Only the authorized payment's row is returned, even if its PDF contains other clients. No carrier connection, reimport, database migration or financial-record update is required by this feature. Existing imports gain details immediately.
- **Dashboard** (`/dashboard`): a statement-month selector (months visible to the signed-in user, defaults to the latest, invalid links fall back with a notice) drives the commission total, entry count, category chart and production-group breakdown together. The **monthly chart** is separate: it always shows every imported month, stacked by the carriers the user can see (legend, signed amounts, per-carrier tooltip, month total, expandable amounts table; negative amounts plot below zero; "no entries imported" is distinguished from a zero total). The "recent statements needing review" card covers only the five most recent statements. Production groups say they are carrier commissions, not Career take-home earnings. On small screens a Menu provides the same role-filtered navigation, and a load error offers a read-only retry. Presentation only: totals come from the same signed-cent ledger rows.
- **Statement totals wording:** previews and imported statements show commission entries this month, an amount added/deducted from a previous statement (or a zero previous balance), and the statement total. Dashboard/activity explanations use the same plain language.
- Dashboard scope: Owner: agency; Manager: self + direct reports; Agent: self (row access enforced by RLS).
- **Commission activity** (`/payments`): search by client name or member ID; combine statement month, carrier, credited/writing agent, product type, payment category and inclusive policy-effective-date filters. Owner can also select Unassigned only. Apply filters resets to page 1; Clear filters selects all months. Page sizes are 25, 50 or 100 commission entries, with Previous/Next controls and entry counts. Signed totals and category totals cover every matching payment, not only the displayed page. Free-text searches use a POST server action; names and IDs stay out of URLs and ordinary access logs. Filters and searches are not saved across refreshes; existing `?month=YYYY-MM` links still work. The default view is all months.
- **Reports**: a collective production report (totals by category + a downloadable CSV) of whatever they are allowed to see. Independents use this to send a report upstream externally; nothing is sent automatically.

**Owner**
- **Statements**: upload a PDF, preview it (new / already imported / needs review / unassigned), approve the import. History of all statements (manual and portal).
- **Statement tracking** (Statements page): a year selector and month cards per visible carrier/statement owner using all RLS-visible saved statement metadata. Imported, Needs review and None on file describe document presence only, not missed payments. Superseded copies are excluded; unknown-month files stay in the latest-100 History table.
- **View PDF** on any statement (opens the stored original in a new tab; Owner only, never cached, every view is written to the audit trail).
- **Writing agents to match**: names on a statement that nobody on the team has (or that several teammates share) are listed in the preview. Pick an existing teammate or create a new agent (name pre-filled from the printed `LAST, FIRST`, optional payee ID). The choice is remembered for future statements. Same name on several teammates is **never guessed**: it stays in review unless the payee ID on the statement matches exactly one of them.
- **Duplicates and corrections** (same carrier, month and owner): same file name + identical payments = duplicate, imported once. Same file name + mostly the same payments (50% or more) = **corrected version**: it is imported and the earlier one moves to **Superseded** (kept and viewable, excluded from the dashboard and reports; each page links to the other). Identical PDF bytes under another name are skipped. Different file name with identical payments still goes to review.
- Mark a statement as belonging to an **Independent agent** (every row is then theirs, whatever name is printed).
- **Payments**: assign unassigned payments to a teammate; optionally remember the printed name as an alias.
- **Users**: add/edit teammates with **agent type** (Career + this agency's levels, Independent, or Captive) and an optional **carrier payee ID**. Owner only.
- **Compensation**: set this agency's career levels (name, order, visibility, on/off), effective-dated rates (fixed dollars or percent of annual premium), and bonuses on/off. History is never overwritten: a new rate starts on its date and ends the previous one the day before.
- **Carriers**: enter the agency's carrier portal login (Ultimate Health Plans, Devoted Health, UnitedHealthcare), Sync now, remove login; see Independent agents' connection status. Sync only downloads and registers statements for review; nothing is imported automatically.
- **Devoted paired review** (`/statements/devoted`): lists unimported PDF + workbook pairs downloaded by Sync now (or uploaded manually) for preview and approval. Requires the two Devoted flags in section 8; Devoted connections for other roles are not available yet.

**Independent agent**
- **Carriers**: enter their own portal login, Sync now, remove login. They are paid directly by the carrier; the app only shows what they were paid, by category.
- **Reports**: their own production as a CSV they can send upstream.
- Optional **owner-level profile** (set by the agency Owner): they can upload and approve statements attributed to themselves. They never see another teammate's statements, Users, or Compensation.

**Captive (LOA) agent**
- Created in Users / Settings as agent type **Captive** with a **principal agent** (any active teammate who is not captive). Their writing-agent name on a statement is matched like anyone else's, but the payment is **credited to the principal** (dashboards and reports count it as the principal's production, in the principal's agency/personal bucket) and the captive agent is recorded as the writer.
- Signs in to CommissionFlow and sees only the payments they wrote (Payments shows the principal's name and a note that the principal pays them directly). No carrier login. The principal sees a **Written by** column. Owner assignments of a captive agent in Payments are credited to the principal the same way.
- The principal pays the captive agent **outside the app**; nothing here calculates that.

**Career agent**
- Sees their own payments. The agency handles carrier statements, so there is no login to enter.

**Manager**
- Sees self + direct reports on Dashboard and Payments. No Statements/Carriers.

**Onboarding** (Owner): welcome, then the same Compensation sections (levels, rates, bonuses), then team, then GoHighLevel (coming soon).

**Not linked from the menu (legacy, still in the code):** `/commissions` and the
old percent-split plan / bonus screens in Settings. See section 5.

---

## 4. How the data flows

Ultimate and UHC statements are single PDFs. Devoted statements are a PDF + workbook pair
and use their own review page (`/statements/devoted`) before the same atomic import.

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
- A corrected statement (same file name, different payments) replaces the earlier one **inside the same transaction**; old rows are flagged `superseded_at`, never deleted. A statement whose payments already have earnings cannot be replaced (the import is refused).
- A row is attributed to a person only when the statement *proves* the writing agent and it matches that person's alias. Anything else stays **Unassigned** for the Owner.

---

## 5. What's missing

**Not built yet**
- GoHighLevel **output** (match contacts, push verified policy information). Agreed behavior and pending design decisions are in [the GHL integration plan](docs/ghl-integration-plan.md). Not built: Settings/Onboarding show an informational "Coming soon" card only. GHL is never a source of payable amounts.
- Career-agent **earnings screens**: the rules, rate locks and approval logic exist in `lib/carriers/compensation`, with tables, but no UI and no job that creates earnings. Payout batches have been removed.
- Carrier parsers beyond Ultimate and the limited verified UHC renewal PDF layout. UHC app-requested PDF/text downloads are locally verified for January-October 2026; unattended sign-in, other layouts and hosted operation remain unverified. Devoted supports only the verified one-page/single-renewal paired layout; other layouts and unattended sign-in remain unsupported.
- **Scheduled** syncing. The worker only handles "Sync now" requests.
- Auto-import for Independent agents' statements (currently the Owner approves every statement).
- Inviting teammates by email (new users get a temporary password shown to the Owner).
- Hosted deployment of the worker (nothing is hosted yet; see section 14).
- Email/SMS verification-code retrieval for carrier sign-in. Carrier MFA stays interactive; no mailbox access exists. A Gmail/Outlook approach is planned separately for Marshall's integration/security review.
- Unattended UHC sign-in (the password step was only accepted manually; see section 9).

**Agreed with Ryan (2026-10-10), not built yet** (see section 7)
- Not wanted for now: override tiers, chargeback rules, split-commission features beyond the compensation rules above.

**Work on unmerged branches (not part of `Main`)**
- `origin` holds **20 feature branches that are not merged into `Main`**, all committed under the git identity `ryanb1210` between 2026-10-21 and 2026-11-07. This README describes `Main` only; none of that work is described as working here. **Section 16 is the review register**: what each branch does, who/when, risks and a suggested review order. Merge nothing from it without Marshall. The redesigned dashboard is `feature/dashboard-filter-ui`, also held for review with Ryan.

**Built: per-company compensation settings (2026-10-10)**
- Career levels, visibility, Owner-editable rates (fixed or percent of annual premium), bonuses on/off, payouts removed. TruePlan's level names and MAPD rates remain **demo seed only**.
- **Still open:** Ultimate MAPD statements do not print premium, so a percent-of-premium rule cannot be quoted until a parser supplies premium (stays `NOT_CONFIGURED`).
- **Still not built:** carrier/product catalog per agency; signup still seeds the legacy 10% / 2% / 1% plan (unused by the statement dashboard). A new agency starts with no career levels until the Owner adds them.

**Legacy code still present (CRM-driven model)**
- `commission_plans`, `commission_plan_rates`, bonuses, `commission_transactions`, `lib/commission-engine`, `/commissions`, Settings plan/bonus screens, `/onboarding`, and the inbound GoHighLevel adapter in `lib/crm` (its webhook route and fake "Connect" button were removed 2026-10-10; `crm_connections` table stays). They still work but no longer feed the dashboard. The signup function `create_agency_with_owner` still seeds the old 10% / 2% / 1% plan. Retire these once nothing needs them.

**Known limits**
- Client detail extraction supports the verified 13-column Ultimate layout, the limited UHC renewal PDF layout (18 source-detail fields) and the limited Devoted paired layout (24 source-detail fields). It reads each relevant saved PDF once per request for the displayed page. A client-name search or product-filter request reads candidate statements after metadata filtering; a member-ID search does not need to scan every client name; details are not stored in the financial tables or a shared cross-user cache. Other layouts need synthetic fixtures and verification. Saved PDFs must remain available and unchanged.
- **Tracked files from Ryan's original prototype:** `.dashboardnotes`, `.filereferenceguide` and `.projecthandoff` in the repo root are stale notes about that prototype (they name real people and prototype files). They are not used by the app. Consider removing them.
- **Unverified:** the payee ID is read from the `W####` code right after the `ADV/MCC/PFS/BRP` marker on Ultimate rows (assumed to be the writer's carrier number). Confirm with Ryan against a real statement. Until then the payee ID only breaks ties between same-name teammates.
- Ultimate parser only recognizes the writing-agent layouts proven in Ryan's prototype (`ADV`, `MCC`, `PFS`, `BRP` codes). Other layouts leave the writing agent unverified -> Unassigned.
- Statement tables show at most 300 rows per page (all rows still import).
- Payments returns only the selected 25/50/100-row page to the browser, but still reads up to 50,000 RLS-visible ledger rows into server memory to calculate full matching totals; Dashboard retains the same cap. This is display pagination, not a database-scale solution. Move filtering/totals to indexed SQL and design protected client-name/product indexes before large agency volumes. Source lookup IDs are batched at 100 to avoid URL/response limits. No new dependencies, schema migrations, carrier downloads or commission updates are introduced.

---

## 6. Recommended next steps (in order)

As of 2026-11-10 (`Main` unchanged since 2026-10-21): the local manual-upload, Ultimate worker pull, UHC and Devoted imports, and payment search have all been verified locally. What remains is mostly review, decisions and hosting.

1. **Review the redesigned dashboard** (`feature/dashboard-filter-ui`) with Ryan; merge only after his feedback.
2. **Review the Devoted integration with Marshall.** Ryan authorized the local migration/import while the approval gate was pending; Marshall's approval is not recorded.
3. **Review UHC's downloaded August and October statements** in Statements without reimporting the eight earlier months, then verify later months as they become available.
4. **Answer the open decisions** in section 7 (payee ID location, captive dollar visibility, hierarchy visibility, annual-premium source, TruePlan rates).
5. **Review the unmerged branches together using section 16**, starting with the three recommended for retirement, then the SunFire/GHL stack one slice at a time. Several parts need Marshall's approval first (commission splits, core RLS changes, live GHL writes, AWS hosting).
6. **Keep running locally. Do not deploy yet.** Run the app, local Supabase and the worker (`npm run start` in `worker/`) on your own machine. Hosting costs money and real client data (PHI) cannot go on any hosted service until HIPAA agreements are in place. Follow section 14 when ready (hosted setup, nightly sync, HIPAA).
7. Career **earnings UI** (preview via `buildEarningsPlan`, Owner approval; no payouts).
8. **Scheduled syncing** and a hosted worker (section 14.4 C and D), once hosting is decided.
9. **GoHighLevel output**: Marshall reviews [the field mapping and connection decisions](docs/ghl-integration-plan.md), then synthetic testing before any real-contact updates. No inbound payable data.
10. Move payment/dashboard totals to indexed SQL before large agency volumes (see "Known limits" in section 5).
11. Retire the legacy CRM-driven code, the old seed data and the stale prototype notes in the repo root.

---

## 7. Decisions to check with Ryan

Assumptions already built in. Please confirm or correct each:

Ryan's answers from 2026-10-10 are marked **Ryan:**.

1. **Overrides**: only for Independent Agency Owners, carrier-reported, never computed. **Ryan:** do not worry about overrides yet.
2. **Owner's own writing is "personal production"**, reported separately from agency production. **Ryan:** correct.
3. **Independent agents' production**: tracked by person only. **Ryan:** independents get their own portal; some can have an owner-level profile. Let them pull a **collective report** and send it upstream externally if they choose, but treat them as a one-person company by default. **Built** (Reports CSV + optional owner-level profile on the Independent).
4. **Name matching**: **Ryan:** assign by writing-agent name (the carrier prints `LAST, FIRST`). If nobody has that name, prompt to create a new agent (built). If two people share a name, use the **payee ID** from the statement, stored on each user (built; the statement location of the ID is unverified, see section 5).
5. **Payee is not proof of the writer.** **Ryan:** agree.
6. **Approval**: Owner approves every import. **Ryan:** sure (keep as is).
7. **Career rates** (MAPD, fixed dollars): BC $300 / $100 / $7, SBC $350 / $125 / $10, CA $400 / $150 / $12.50, PCA $450 / $150 / $15 (T65 / plan change / renewal), effective 2026-10-08. **Ryan:** yes, but TruePlan-specific; every agency must be able to change this in onboarding **and** in Settings at any time. Also rules for other products as a **percentage** (e.g. final expense: percent of annual premium) while MAPD stays fixed dollars. **Built** on Compensation (and the same forms in onboarding). Confirm the seeded TruePlan numbers with Ryan.
8. **Who sees what** for Managers: self + direct reports. **Ryan:** correct.
9. **Duplicate rule**: **Ryan:** identical rows + same file name = duplicate, bring in once; different file name + identical data = review (built). Same file name + different data (decided with Marshall) = corrected version, old one moved to Superseded (built).
10. **Career agents** have no carrier portal login but do log in to CommissionFlow and see only the statements assigned to them up the hierarchy. **Open:** how "up the hierarchy" should work for visibility (today Managers see self + direct reports).
11. **Per-company settings**: **Ryan:** different level names and visibility, compensation plans, bonuses on/off (setting); **no payouts for now (remove)**; split commissions handled by #7; no override tiers, no chargeback rules for now. **Built.**
12. **Open (Captive/LOA agents, built):** a captive agent currently sees the **carrier-paid dollar amounts** on the payments they wrote (the database cannot hide a column per role). That reveals the principal's margin over what the principal pays them. Confirm with Ryan whether that is acceptable, or whether captive agents should see counts only (a change that needs a separate view or hiding the amount column in the app).
13. **Product type for Ultimate:** **Ryan (2026-10-21):** Ultimate only offers MAPDs, so Ultimate payments report Medicare Advantage (MAPD). Other carriers need their own confirmed mapping (section 3).
14. **Devoted approval gate:** **Ryan (2026-10-21)** explicitly told the assistant to proceed with the limited Devoted paired importer. **Open:** Marshall has not approved it (see `docs/devoted-import-approval.md`).
15. **Open (Dashboard):** the redesigned filter-panel dashboard on `feature/dashboard-filter-ui` needs Ryan's feedback (which filters, default month, which table columns) before merge.

---

## 8. Setup and environment variables

Prerequisites: Node 20+, Docker Desktop, the [Supabase CLI](https://supabase.com/docs/guides/cli).
Never copy real PDFs into this repository.

For an existing local installation, back up first and use `npx supabase migration up --local` to apply pending migrations from Main. The `db reset` command below is for a new disposable demo database only; it deletes existing local records.

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
| `POLL_INTERVAL_SECONDS` | worker | Optional, default 30 (minimum 5). |
| `DEVOTED_REVIEW_ENABLED` | app (server only) | `true` shows the Owner Devoted paired review page and allows saving a Devoted carrier login. Default `false`. |
| `DEVOTED_IMPORT_REVIEW_ENABLED` | app (server only) | `true` allows approving a Devoted pair import. Default `false`. Both flags are `false` in `.env.local.example`; never enable them on a database you cannot back up. |

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
| Agent | `agent5@commissionflow.dev` | Jordan Lee | Independent (owner-level profile in seed) |

Going live: see **section 14 (Launch roadmap)** for hosting options, costs, step-by-step
setup and the HIPAA requirements. In short: create a hosted Supabase project,
`npx supabase link --project-ref <ref>`, `npx supabase db push`, set the variables
above in Vercel, deploy. **Skip `seed.sql` in production.** Migration `0006` creates
the private `statements` storage bucket.

Commands: `npm run dev | build | test | lint | typecheck | sample:statement`.

Devoted imports need migration `0011_devoted_paired_sources.sql` plus the two flags above in your ignored `.env.local`. See the [activation and recovery notes](docs/devoted-import-live.md). Back up before applying migrations; never use `db reset` on a ledger you want to keep.

Payment details use the existing `pdf-parse` dependency and private statement storage; no extra environment variables are needed. The synthetic PDF fixture pads beyond `Buffer.poolSize` so parser tests also run on Node versions with a larger shared buffer pool.

---

## 9. Carrier worker (`worker/`)

Logging into a carrier portal needs a real browser, so it **cannot run on Vercel**. The
worker is a separate small Node package that talks to the same Supabase database. It only
*downloads statements* into the private bucket and registers them for review; the web app
does all parsing and import.

```bash
cd worker
npm install
npm run browsers     # downloads Chromium once
npm run once         # process pending "Sync now" requests and exit
npm run start        # keep polling every POLL_INTERVAL_SECONDS
```

It reads `../.env.local`.

**Supported carriers**

| Carrier | Source | Sync now | Notes |
| --- | --- | --- | --- |
| Ultimate Health Plans | PDF | Locally verified (live, automatic login) | Latest run: 9 found, 8 skipped, 1 PDF saved for review, zero failures. Selectors in `worker/src/carriers/ultimate.ts` (ported from Ryan's prototype). |
| Devoted Health | PDF + workbook pair | Locally verified (live, automatic login) | 9 existing pairs skipped, zero failures. Also has a separate explicit download command, see [Devoted integration status](docs/devoted-integration.md). |
| UnitedHealthcare (Jarvis) | PDF + text | Locally verified after manual password entry and SMS verification | Ten January-October 2026 pairs downloaded, zero failures. **Automatic password acceptance is unverified**: the saved username was accepted, but later automated attempts did not reach verification (Ryan confirms the credentials are correct and suspects a portal issue). |

**How it behaves (all carriers)**
- Picks up connections where someone clicked **Sync now** (`sync_requested_at`) and decrypts the saved login (AES-256-GCM, bound to the connection id). An **Independent** agent's connection tags statements as theirs; the **Owner's** connection produces agency statements.
- Submits the saved username/password **automatically** in a headed worker browser, only on exact approved HTTPS hosts (never lookalike hosts, password-reset or verification-code forms), **at most once per request**. Rejected credentials stop automatic submission and the browser is kept for a user-requested retry after replacing the login.
- Verification codes, push approvals, passkeys, CAPTCHA and unfamiliar sign-in screens stay **interactive**: the app shows Sync in progress or a verification request and waits up to 30 minutes. No mailbox integration, security bypass, session export or on-disk cookie persistence exists.
- Sessions are kept **in memory per connection** for later requests; restarting the worker or carrier session expiry may require verification again. Retry reloads updated sign-in code without losing its browser.
- Ultimate, Devoted and UHC downloads are hash-verified and stored privately (`<agency>/<sha256>.pdf`; Devoted pairs under `<agency>/devoted-inbox/<connection>/<pairHash>.*`; UHC under `<agency>/uhc-downloads/<connection>/<pairHash>.*`, manifest written last so incomplete pairs cannot be reviewed). Identical files reuse existing statements; changed files reach correction review, never automatic import. Cleanup of private companion sources is not automated.
- UHC discovers available months for the current year (and the previous year in January/February) and validates PDF/text filenames against the selected month and signed-in PID.
- On a login problem, MFA prompt or portal change the connection becomes **Needs attention** with a safe message (no URLs, selectors, portal content or credentials).
- Sync writes **no financial rows**. Every imported statement still goes through preview and Owner approval.

Adding a carrier: implement `StatementParser` (`lib/carriers/types.ts`, register in `lib/carriers/index.ts`) **and** `CarrierPortal` (`worker/src/carriers/types.ts`, register in `worker/src/carriers/registry.ts`). The carrier name string must be identical in both. Paired carriers use their paired review adapter instead of registering a fake single-PDF parser; connection options are separate in `lib/carriers/connectionCarriers.ts`. A new adapter must provide the same automatic-login/verification handoff before being exposed as supported.

TODO: nightly scheduled syncs; MFA-code retrieval; monitoring/alerts; Dockerfile and hosting (section 14).

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
  payments/         "Commission activity": search, filters, assign (Owner)
  statements/       upload + history + coverage; [id] preview/approve; devoted/ paired review (Owner)
  carriers/         carrier login + sync status (Owner, Independent agents)
  users/            team + agent type/level (Owner/Manager)
  compensation/     per-agency levels, rates, bonuses on/off (Owner)
  reports/          collective production report + CSV
  settings/         legacy plans/bonuses/CRM + team add
  commissions/, onboarding/   legacy / onboarding screens
/app/api            reports/collective (CSV), statements/[id]/pdf (Owner, audited)
/components         ui/ primitives; dashboard/, statements/, payments/, carriers/, users/, compensation/, settings/, onboarding/
/lib
  carriers/         PURE carrier logic: parsers (ultimate/, uhc/, devoted/), money, duplicate planning,
                    assignment, preview, sample statement, compensation (rate locks, earnings plan)
  pdf/              PDF text extraction (pdf-parse 1.1.1, pinned on purpose)
  crypto/           credential encryption (no app imports; worker reuses it)
  services/         orchestration: stored PDF -> preview -> import; payment ledger; Devoted pairs
  repositories/     ALL database access (supabase-js)
  reporting/        pure aggregation (carrierMetrics, carrierMonthlySeries, paymentQuery, statementCoverage...; metrics.ts is legacy)
  auth/             session, role guards, agent-type validation, carrier-login access rule
  workbooks/        Devoted workbook reading
  commission-engine/, crm/   LEGACY CRM-driven model
/worker             separate package: Playwright portal pull (carriers/ has ultimate, devoted, uhc)
/supabase           migrations/ (0001-0011), seed.sql, tests/ (SQL regressions, run with psql)
/docs               carrier import notes, regression tests, GHL plan
/types              hand-written schema + domain types
/scripts            make-sample-statement.ts, make-import-regression-fixtures.ts
```

Layering: UI -> server actions -> services -> repositories (database) and
`lib/carriers` (pure rules). Business rules never import UI, and carrier
parsing never touches the database.

Migrations: `0001` base schema/RLS, `0002` grants, `0003` comp plans (legacy),
`0004` onboarding, `0005` carrier statements/compensation model, `0006` statement
import function + storage bucket + sync request column, `0007` statement review (superseded statements, payee ID, `import_statement` supersede support), `0008` captive agents (`users.principal_id`, `carrier_transactions.writing_user_id`, RLS for the captive agent, `import_statement` records the writer), `0009` per-agency career levels, bonuses on/off, percent-of-premium rules, payout tables removed, `0010` Independent owner-level profile (`users.independent_owner`), `0011` Devoted paired sources.

`types/database.ts` is hand-written; regenerate with
`supabase gen types typescript --linked` once linked to a real project.

---

## 12. Verification log

**Last recorded full run (2026-10-21, `Main`):** `vitest` 393 tests in 55 files passing, app and worker `tsc` clean, `eslint` clean, `next build` succeeds. Earlier runs: 230 (2026-10-20), 170 (2026-10-10), 133, 113 (2026-10-08).

**Local checks recorded in the changelog (local Supabase and local worker only):**
- Nine real Ultimate PDFs imported through upload/preview/approve and checked against saved sources (94 entries, 2026-10-20); eight UHC and nine Devoted statements imported later. The working ledger then stood at 155 entries / 1,286,819 cents.
- `supabase/tests/role_access.sql`: nine synthetic users, two agencies, exact visible-entry sets per role, captive/principal attribution, cross-agency isolation, rollback-only (passed 2026-10-21). Run with `psql -U postgres -d postgres -f supabase/tests/role_access.sql` against the local database (migrations through 0011).
- Synthetic three-carrier repeat/correction regressions ([docs](docs/import-regression-tests.md)): exact repeats, regenerated sources, recognized corrections, retained originals and failure rollback; before/after fingerprints match. Browser correction/retrieval unverified.
- Browser smoke checks of Career, Independent and Manager demo sign-ins, then populated flows in an isolated synthetic environment (2026-10-21). Captive login and the Independent owner-profile flow remain unverified.
- Dashboard: owner month selector, mobile navigation, carrier-stacked chart (desktop, keyboard tooltip, amounts table) and statement-total wording reviewed. Phone chart, positive-balance and unimported-preview wording, long-value dialogs and pagination wrapping remain browser-unverified.
- Live worker runs: Ultimate and Devoted automatic login/sync; UHC sync after manual password and SMS verification.

**Not verified:** anything on a hosted Supabase/Vercel/worker, unattended or scheduled syncs, UHC automatic credential acceptance, other carrier layouts, and browser flows for roles/screens marked unverified in section 1.

Known quirk: `pdf-parse` 1.1.1 fails on PDFs smaller than about 4 KB (buffer-pool
offset bug). Real statements are much larger; only hand-made test PDFs are affected
(the test fixture pads itself for this reason).

---

## 13. Contributing (version control process)

**For Ryan, Marshall, and their AI assistants: follow this every time you change
the project. AI assistants must do this automatically — do not wait to be asked.**
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

**Branches held for review:** if Marshall says a branch must be reviewed (for example with Ryan) before it merges, push it and leave it unmerged until he says so, even when the change would otherwise be allowed.

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

### Standing instruction for AI assistants

This workflow applies to **every** task that changes files; nobody has to ask for
it. Branch from an up-to-date `Main`, run the checks, commit with a meaningful
message that includes the README/changelog update, push the branch, then merge only
when "What you can do on your own" allows it. Big requests are split into one
branch per phase. (Recorded in `.cursorrules`.)

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
- **0 -> 1:** a real Ultimate PDF imports correctly on a local run, and the worker pulls once with Ryan's login (**done locally 2026-10-20/21**).
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
- [ ] Rotate Ryan's old Ultimate password (it was in his prototype) and use new production keys; remove the stale prototype notes in the repo root (section 5)
- [ ] Remove demo seed users, retire the legacy CRM-driven code
- [ ] Error pages and logs checked for PHI leaks
- [x] Real Ultimate PDF and worker pull verified locally (done 2026-10-20 and 2026-10-21)

---

## 15. Changelog (newest first)

- **2026-11-10** - README accuracy sweep against the 2026-10-21 changelog entries: refreshed the status table (393 tests, local vs hosted verification, UHC/Devoted/worker rows), moved loose feature paragraphs into role-based functionality and the verification log, rewrote the carrier worker section (supported carriers, automatic login, in-memory sessions), added the two Devoted environment flags and migration 0011, updated project structure, next steps and open decisions, and listed the unmerged feature branches and stale prototype notes. Documentation only; no code, schema or behavior changes. TypeScript, ESLint and `vitest` (393 tests) pass; no browser or database checks were re-run for this sweep.

- **2026-11-10** - Add section 16, the unmerged branch review register: for each of the 20 unmerged branches, what it adds, who committed it and when, size, migrations, test/check results on the largest branch, concerns and a recommendation, plus a suggested review order and per-slice merge checklist. Documentation only; nothing from those branches was merged, run live or changed. Checks run for the register: TypeScript, ESLint and `vitest` on `Main` content (the largest branch was checked separately in a temporary copy, since deleted).

- **2026-10-21** - Standardize automatic saved-login submission for Ultimate, Devoted and UHC, including Devoted Login/Auth0 and UHC username/Continue. Retain per-connection in-memory browsers; hand off verification and rejected/unknown/reset screens; guard exact HTTPS destinations and avoid repeated credential submission. Update connection guidance/progress labels and add synthetic authentication regressions. No imports, schema, permissions or dependency changes. Live Devoted tracing found the callback was being interrupted by early navigation; wait for a visible signed-in portal marker before leaving callback routes. A regression covers this ordering. The live Devoted retest automatically opened Login, submitted saved credentials and reached My Commissions without manual input. All 391 synthetic tests, app/worker TypeScript and ESLint pass; The live worker subsequently verified Devoted automatic login/sync (9 skipped, zero failures) and Ultimate automatic login/sync (8 skipped, 1 PDF saved for review, zero failures). UHC submitted the saved credentials but the carrier reported wrong username/password. Reject known credential-error screens immediately and preserve the browser for a user-requested retry after Replace login; do not repeat submissions. Ryan confirms the saved credentials are correct and suspects a carrier portal issue. Credentials are unchanged; no further UHC retry is requested. A later retry accepted the username and reached Enter Your Password. Skip any read-only username field on that second step and report password-field/submit failures safely. Manual password entry and SMS verification succeeded (first SMS required resend); subsequent sync downloaded ten pairs with zero failures. UHC automatic password acceptance remains unverified. Use typing/blur events and verify each field retains the entered value before submission. A separate fresh-context acceptance test still did not reach verification, so automatic UHC credential acceptance is not claimed; it requested/sent no verification code and left the working authenticated browser untouched. All 393 synthetic tests, app/worker TypeScript and ESLint pass. The working ledger remains 155 entries / 1,286,819 cents. Ledger unchanged at 155 entries / 1,286,819 cents.


- **2026-10-21** - Fix live UHC dropdown parsing: read visible options without decorative checkmark text (the selected month had appeared as OCTOBERCHECK), normalize labels and select options directly. All 382 synthetic tests, app/worker TypeScript and ESLint pass. Same-session live retry downloaded all ten available January-October PDF/text pairs with zero failures. Read-only preflight identifies eight repeat months and new August/October (6 entries / 17,352 cents); no imports or ledger changes.


- **2026-10-21** - Improve UHC sync diagnostics with safe failing-stage/validation reasons and per-month failure messages. Avoid navigating away from an already-open statement page; reload downloader code on retry while retaining its authenticated browser. Existing running workers require one restart to acquire this capability; no credentials, cookies or source data are persisted for session transfer. All 379 synthetic tests, app/worker TypeScript and ESLint pass; downloader reload verified through the installed worker runtime. Live failure cause remains unverified; manual PDF download succeeded, automatic sync has not completed. No imported records changed.


- **2026-10-21** - Connect UHC Sync now to the existing polling worker using the Jarvis downloader, retained interactive browser/MFA, current-revision downloads, private PDF/text preservation and existing statement review. No automatic import, migration or dependency change. All 378 synthetic tests, app/worker TypeScript, ESLint and production build pass; owner UHC connection card browser-verified. Live Jarvis sync remains unverified; existing imported records are preserved.


- **2026-10-21** - Add owner Devoted carrier connections and app-requested polling sync with a retained in-memory interactive browser. Preserve complete PDF/workbook pairs privately for existing preview/approval, skip imported pair hashes, verify inbox authorization/integrity and keep incomplete pairs out of review. No automatic commission import or schema/dependency change. All 356 synthetic tests, app/worker TypeScript, ESLint and production build pass; owner connection card and empty inbox browser-verified. Live app-triggered portal sync and a newly downloaded-pair approval remain unverified.

- **2026-10-21** - Test repeat imports and recognized corrections for Ultimate, UHC and Devoted using synthetic parser/preview cases and isolated database rollback regressions. Verify originals/history, active corrected totals, explicit Devoted approval and atomic failure rollback. All 347 tests, TypeScript and ESLint pass; working statement/ledger/source/audit/assignment fingerprints match. No production behavior or imported-record changes.

- **2026-10-21** - Complete the carrier chart palette so UHC and future series have visible colors; render stacked segments immediately. All three live carrier legend colors and stacked bars verified; production build passes.

- **2026-10-21** - Stack monthly commission bars by carrier with a legend, per-carrier tooltip/month total and accessible amount table. Preserve signed integer-cent aggregation and show negative contributions below zero. 335 tests, TypeScript, ESLint and production build pass. Desktop stack, legend, keyboard tooltip and amount table browser-verified; phone viewport remains unverified. No migration, dependency or import changes.

- **2026-10-21** - Explain statement totals using commission entries plus amounts added/deducted from previous statements. Add the breakdown to preview and imported statements and replace accounting jargon in dashboard/activity explanations. Presentation only; 331 tests, TypeScript, ESLint and production build pass; negative and zero-balance imported summaries browser-verified. Positive balance and preview browser cases remain unverified.

- **2026-10-21** - At Ryan's explicit instruction to proceed without Marshall approval, activate the limited Devoted paired importer after database/storage backup and isolated SQL/RLS tests. Add read-excel-file@9.3.9 and migration 0011; preserve UHC/Ultimate details. Import nine saved pairs (9 entries / 26,019 cents), verify 24 source fields and replay protection. All 326 tests, app/worker TypeScript, ESLint and production build pass. See docs/devoted-import-live.md; Marshall approval is not claimed.

- **2026-10-21** - Add UHC renewal PDF parsing and source details through the existing permission, preview and atomic import flow. Reject unsupported layouts, balances and unreconciled totals. Eight saved pairs verified read-only; 282 tests, TypeScript, ESLint and production build pass. Eight UHC statements imported locally, activity/source details/coverage verified, replay proposes zero new rows. Ultimate remains unchanged.

- **2026-10-21** - Expand GHL planning with the supplied contact/product field inventory, unresolved key/type checks, per-agency setup worksheet, synthetic history-note example and pilot acceptance cases. Documentation only; no API connection, schema, new rules or contact writes authorized or implemented.


- **2026-10-21** - Clarify carrier commission totals versus agent earnings and bank deposits; improve phone selector targets, pagination wrapping and long detail values. Presentation only; no calculations, data, permissions or dependencies changed. Statement coverage phase passed 256 tests, TypeScript, ESLint and production build. All 256 tests, TypeScript, ESLint and production build pass. Owner statement coverage (January–September imported, October–December none on file) and 390px month cards/activity filters reviewed; dashboard heading verified. Dialog/pagination edge cases remain browser-unverified.


- **2026-10-21** - Add read-only statement coverage by year, carrier and owner, complete session-scoped metadata reads, explicit missing-document wording and mobile month cards. No schema, imports, financial records or permissions changed. Browser flow unverified.

- **2026-10-21** - Extend the separate Devoted downloader with explicit `--year` scope, one interactive sign-in, all-page discovery, per-pair failure reporting and unchanged content-hash preservation. Tests cover other-year exclusion, ambiguous dates and missing/failed pairs; all 254 tests plus app/worker TypeScript and ESLint pass. Live 2026 run completed: 9/9 available pairs (January-September), zero failures, all manifest/file hashes verified, and existing local content reused. The main ledger remains 94 entries / 1,110,416 cents. No imports, schema, dependencies or Ultimate changes.


- **2026-10-21** - Verify the separate Devoted worker live for one approved pay period after interactive sign-in: successful PDF/workbook/manifest preservation, clean exit and automatic browser close, and matching stored-file hashes. Main ledger remains 94 entries / 1,110,416 cents. No imports or additional periods downloaded; unattended login, paired parser and scheduled sync remain unavailable.


- **2026-10-21** - Add a separate Devoted download-only worker command with explicit pay date, interactive authentication, private paired-file preservation, pagination, unsafe-link/file rejection and duplicate/overwrite checks. Approved sample PDF/workbook inspected locally; PDF lacks carrier Member ID while workbook supplies 22 columns, so no placeholder parser or imports enabled. New worker live run remains unverified. Document paired-source parsing/storage decisions requiring Marshall review; no dependencies, schema, financial records or Ultimate changes.


- **2026-10-21** - Document Ryan's agreed GHL current-field/history-note and evidence-based policy-status behavior, screenshot field keys/dropdown choices, proposed matching safeguards, and Marshall's pending connection/design decisions. Plan only: no API access, credentials, schema, financial rules or GHL contact changes.


- **2026-10-21** - Verify populated Career, Independent and Manager screens in a separate local source snapshot and Supabase project (`commissionflow-role-test`, app 3001, API 55421, DB 55422). Imported a fully synthetic 37-entry, 13-column PDF totaling 83,350 cents through upload/preview/approve. Career: 3 entries / 21,000 cents, all 13 detail fields, chargeback filter 1 / -15,000 cents, another agent's client search empty, shared PDF direct request denied. Independent: 2 entries / 3,000 cents and 13-field dialog, Career client search empty. Manager: self + direct reports only, 30 entries / 24,100 cents, allowed-agent options, page 2 retains full totals, report count 30, direct-report filter/details and excluded-team search checked. Career and Independent report counts 3 and 2. Main app database remains 94 entries / 1,110,416 cents; carrier worker never run. Synthetic environment preserved separately and test services stopped after review. Captive/Independent owner-profile browser flows remain unverified; no product code or permission changes.


- **2026-10-21** - Browser smoke checks with existing demo Career (Priya), Independent (Jordan) and Manager (Mike) sign-ins: expected navigation, empty dashboard/commission activity/report states, Career agency-managed carrier message, Independent private credential form, Manager team menu. Career direct access to Statements redirects to Dashboard. Owner sign-in and dashboard restored; 94 entries totaling 1,110,416 cents unchanged. No imports, credentials saved, syncs or commission changes. Demo roles have no imported entries: populated client-detail/role browser flows, captive browser login and Independent owner-profile browser flow remain unverified; the separate synthetic RLS regression covers populated-row enforcement.


- **2026-10-21** - Add a rollback-only synthetic database access regression: nine users, two agencies, exact visible commission-entry sets for each role, direct-report configuration, captive/principal attribution and cross-agency isolation. Ran successfully against local Supabase; ledger fingerprint unchanged after rollback. Existing 238 synthetic unit tests pass. No permission policies, schema or real records changed; role-specific browser sign-in flows remain unverified.


- **2026-10-21** - Record successful owner browser verification of the dashboard month selector after renewed browser permission. Older-month totals, categories and production breakdown, month-preserving activity link, latest reset and unavailable-month notice checked. Verification only; no financial records changed.


- **2026-10-21** - Add dashboard statement-month selection with latest-month reset, access-scoped options and safe unavailable-month fallback. Selected-month totals, entries, categories and production groups stay aligned; Commission activity link retains the month. Monthly chart and recent-review scope remain unchanged. All 238 synthetic tests, TypeScript, ESLint and production build pass. Owner browser flow verified after renewed permission: March shows 10 entries and $260.26, commission-activity link retains March, latest-month reset returns September, and unavailable December falls back with a notice. Other role-specific browser flows remain unverified. No commission records, schema or permissions changed.


- **2026-10-21** - Clarify dashboard month, entry counts, total meaning and production breakdown; label the five-statement review scope accurately. Add small-screen navigation, constrained content width, active-page semantics and a safe dashboard load-error screen. Presentation only; queries, permissions, financial rules and records unchanged. TypeScript, ESLint, 230 synthetic tests and production build pass; owner dashboard and mobile navigation reviewed in the browser. Contain chart tooltip overflow on narrow screens. Empty/error browser flows and other role-specific browser flows remain unverified.


- **2026-10-21** - Clarify commission entries versus bank payments: rename the ledger/navigation to Commission activity; label row counts and category/page/import counts as commission entries across ledger, dashboard, reports and statement review. Label row sums Commission total and explain statement totals/carried balances and bank comparison. Copy only; all calculations, URLs, records and permissions remain unchanged. Required checks and local browser wording review completed with this change.

- **2026-10-21** - Add separate product-type filtering and payment/detail labels. Use the user-confirmed Ultimate-only-MAPD carrier mapping, preserve source-vs-carrier evidence and retain Unknown/conflict handling for unconfirmed products. Reporting only: no financial records, compensation rules, schema or dependencies changed. All 230 synthetic tests, TypeScript, ESLint and production build checked; local owner browser flow verified against saved statements.

- **2026-10-21** - Add private client/member search, combined payment filters, full-matching-set totals, 25/50/100-row pages and an accessible client-details dialog. Preserve session/RLS scope and ledger records; batch PDF source lookups. 201 synthetic tests plus TypeScript/ESLint checks pass; owner browser checks cover all 94 saved payments. Production build checked with this change. Document the remaining 50,000-row server-memory limit and separate email-MFA review.

- **2026-10-20** - Add client names and expandable, source-verified Ultimate payment details from saved PDFs, including all 13 printed columns and source row/filename. Preserve ledger amounts, assignment rules, RLS and imports. Add synthetic extraction/integrity/access tests and adapt synthetic PDF padding to runtime buffer-pool size. All 94 local payments have verified details; TypeScript, ESLint, Vitest and build validation recorded with this change.

- **2026-10-10** - Independent collective report and owner-level profile (Phase 4): Reports page + CSV download (RLS-scoped); Independents can be given an owner-level profile to upload/approve their own statements only. Migration `0010`. README section 2 is the next-session test plan for Marshall and Ryan. tsc, eslint, vitest (170) pass.
- **2026-10-10** - Per-agency compensation settings (Phase 3): Owner-editable career levels (name, order, visibility), effective-dated rates (fixed dollars or percent of annual premium), bonuses on/off, payout batches removed. Compensation page + the same forms in onboarding. Migration `0009` (apply with `npx supabase migration up`; refuses to run if payout data exists). Git workflow is a standing instruction (do not wait to be asked). tsc, eslint, vitest (161) pass.
- **2026-10-10** - Captive / LOA agents (Phase 2): new agent type with a principal, production credited to the principal with the writer recorded, captive agents get their own login scoped to what they wrote, "Written by" column on Payments, migration `0008` (apply with `npx supabase migration up`). `.cursorrules` now makes the git workflow a standing instruction. tsc, eslint, vitest (145) pass.
- **2026-10-10** - Statement review (Ryan's feedback): open the original PDF, same-file-name duplicate rule and "Superseded" corrected statements (excluded from reports, still viewable), unmatched writing agents prompt (assign or create agent, remembered), payee ID on users and statements with never-guess tie-breaking for shared names. Migration `0007` (apply with `npx supabase migration up`). Ryan's #7 answers recorded in section 7. Captive/LOA agents, editable compensation rules and payout removal are agreed but not built yet. tsc, eslint, vitest (133) pass.
- **2026-10-10** - Multi-company framing: TruePlan is the first customer, not the only one. Documented per-company configuration TODOs (career levels and visibility, compensation/percentage plans, optional bonuses, payout options, new-agency onboarding) in sections 5-7; made section 14.5 (HIPAA) per-customer. Docs and rules only; no code or schema changes.
- **2026-10-10** - Added section 14 "Launch roadmap" (stages local -> hosted test -> real-data pilot -> launch, hosting options and prices, setup steps for Supabase/Vercel/Fly.io, HIPAA agreements and steps, pre-launch checklist). Reworded next step #4: keep running locally, deploy only when ready to launch.
- **2026-10-10** - Added section 13 "Contributing" (branch workflow, merge rules, what needs Marshall's approval) and a matching "GIT WORKFLOW" block in `.cursorrules`.
- **2026-10-10** - GoHighLevel is output-only: removed the inbound CRM webhook route (`/api/webhooks/crm`) and the stub "Connect GoHighLevel" action; CRM card is now an informational "Coming soon" card. tsc, eslint and vitest (113) pass.
- **2026-10-08** - MVP statement flow: upload/preview/approve import, Payments, Carriers (encrypted logins + Sync now), carrier-based dashboard, agent type/level in Users, carrier worker (unverified), `import_statement` + storage bucket migration (`0006`), sample statement generator, README rewritten as a living handoff document.
- **2026-10-08** - Merged Ryan's carrier-statement logic: Ultimate parser, duplicate planning, writing-agent classification, rate locks and earnings plan (pure logic + tests), migration `0005`, `.cursorrules` rewritten for the statement-driven model.
- Earlier - CRM-driven MVP (auth, roles, comp plans, bonuses, GoHighLevel scaffold). Now legacy.

---

## 16. Unmerged branch review register

**Purpose.** Ryan has been working on branches in his own checkout while Marshall was away. This register lists every branch on `origin` that is **not merged into `Main`** so Marshall and Ryan can review them together instead of merging blind. **Nothing here is merged, and nothing here should be merged without Marshall's review.** Compiled 2026-11-10 from git history, diffs and automated checks only. **I did not run any of this against a live portal, GHL account or database**, and I did not read every line of the 326-file diff. Anything marked "inference" is a conclusion from file names, commit titles or merge conflicts, not something confirmed by reading the code.

**Who and when.** Every unmerged commit is under the git identity `ryanb1210` (the same identity as 38 commits already on `Main`; Marshall Royce has 16). The commits are dated **2026-10-21 to 2026-11-07**. Git cannot say whether a given commit was typed by Ryan or produced with an AI assistant. Several commit messages say they were made at Ryan's explicit instruction.

**Two repositories.** A README note on the largest branch says Ryan's checkout fetches from `ryanb1210/ComFlow` and pushes every branch to both `ryanb1210/ComFlow` and `mrro253/ComFlow` (Marshall's). **Unverified:** whether `Main` in Ryan's repository matches `Main` here. Confirm that before merging anything, so the two do not diverge.

### 16.1 Summary

| Branch | Commits | Files | Migrations | Recommendation |
| --- | --- | --- | --- | --- |
| `devoted-import-approval` | 1 | 3 | 0 | **Retire** (superseded by `Main`) |
| `devoted-import-review` | 1 | 39 | 1 (`0011`, identical to `Main`) | **Retire** (superseded by `Main`) |
| `uhc-statement-download` | 2 | 8 | 0 | **Retire** after one check (16.2) |
| `client-commission-history` | 1 | 8 | 0 | Hold; overlaps the large stack |
| `statement-totals-check` | 1 | 11 | 0 | Hold; overlaps the large stack |
| `carrier-sync-results` (+ `statement-review-queue`) | 3 (+1 inside) | 23 | 0 | Hold; overlaps the large stack |
| `sunfire-export-test` | 2 | 4 | 0 | Hold: low code risk, but a scope decision |
| Large stack, 12 branches ending at `ghl-contact-preview` | 83 total | 326 | 9 (`0012`-`0020`) | **Do not merge as-is**; review in slices (16.4) |

"Commits" counts commits not on `Main`. Branch names are shortened here; each is `feature/<name>` on `origin`.

### 16.2 Recommended for retirement (superseded by `Main`)

All three were written 2026-10-21 by `ryanb1210`. `Main` now contains a later version of the same work, so merging them produces conflicts (`add/add` in the same files) and would risk replacing the newer code.

- **`devoted-import-approval`**: a decision document, "Prepare Devoted paired statement import decisions for Marshall approval". `Main` already has `docs/devoted-import-approval.md`. Conflicts: 3 files.
- **`devoted-import-review`**: "Build gated Devoted paired imports for isolated review and testing", the original review version of the Devoted importer. `Main` has the activated version and the identical migration `0011`. Conflicts: 8 files.
- **`uhc-statement-download`**: "Add UHC statement downloads with retries that retain sign-in" and "Read UHC payee proof from the shared account header". `Main` has the later UHC downloader. Conflicts: `uhcDownload.ts` and its test. **Check first:** confirm the small payee-proof fix (one commit, about 5 lines in `worker/src/carriers/uhcDownload.ts`) is in `Main`'s downloader; I did not verify this.

To retire (Marshall, after the check; deletes a remote branch, so it is done by hand):
`git push origin --delete feature/devoted-import-approval feature/devoted-import-review feature/uhc-statement-download` (and the same on Ryan's repository if both are used).

### 16.3 Stand-alone branches (not part of the large stack)

These branch directly from `Main`, add no migrations, and conflict with each other **only in the README**. The first three conflict in code with the large stack (inference: the stack holds its own version, see "Combine client history statement checks and sync results").

- **`client-commission-history`** (1 commit, 2026-10-21): read-only client commission history across statement months, in the Commission activity page. Touches `payment-ledger.tsx`, `payments/actions.ts`, new `lib/reporting/clientCommissionHistory.ts` with tests. Code conflicts with the stack: `payments/actions.ts`, `payment-ledger.tsx`, `clientCommissionHistoryService.ts`.
- **`statement-totals-check`** (1 commit, 2026-10-21): read-only comparison of statement totals against imported entries, a new `/statements/checks` page. Code conflict with the stack: the Statements page.
- **`carrier-sync-results`** (3 commits, 2026-10-21; contains `statement-review-queue`): shows future carrier sync results, separates confirmed repeat downloads from statements needing review, records live Ultimate/Devoted sync checks. Code conflicts with the stack: Carriers and Statements pages, `lib/carriers/syncResult.ts`.
- **`sunfire-export-test`** (2 commits, 2026-10-21; 4 files, +111 lines): a **research-only** worker command that opens a manually signed-in browser on the SunFire portal and exports two CSVs (Submitted Enrollments, then Book of Business). Reviewed concerns are small: it is locked to `https://www.sunfirematrix.com/app/agent/...`, touches no database, stores no credentials, imports nothing, and adds no dependency. Why it is still held: SunFire enrollment data is **outside the MVP scope in `.cursorrules`** (carrier statements, GHL as output), the README text says it was live-tested against the real portal, and Ryan's own note says the Book of Business view covers only the "Big 6" carrier group, not all enrollments. It merges cleanly with everything except the README. Decide whether SunFire is in scope first.

Recommendation for the three history/sync branches: **do not merge separately.** Decide whether the stack's versions replace them; if so, retire them with the stack. If you want them sooner, review them one at a time with a rebase onto the stack decision.

### 16.4 The large stack (12 branches in a single line)

The branches below are cumulative: each one contains everything above it. All commits are `ryanb1210`, 2026-10-21 to 2026-11-07. Merging any branch merges all earlier ones. Sizes are the increase over the previous branch.

| # | Branch | Adds (from commit titles; not all code read) | Size | Migration |
| --- | --- | --- | --- | --- |
| 1 | `sunfire-enrollment-collector` | Private SunFire enrollment collector with identity checks (its commits reappear, rewritten, in #2) | 3 commits, +287 lines | none |
| 2 | `sunfire-sync` | Connects SunFire enrollment sync and a private collection review | +4 commits, 27 files | none |
| 3 | `sunfire-match-review` | Read-only matching of SunFire enrollments to commission entries, and chargeback review | +3 commits | none |
| 4 | `sunfire-confirmed-links` | Owner-confirmed enrollment-to-commission links in the audit trail | +1 commit | none |
| 5 | `sunfire-followup-notes` | Owner-reported "did not take effect, no commission expected" with private notes | +1 commit | none |
| 6 | `sales-dispositions` | Agent-assigned sales and manual GHL-aligned policy dispositions (Active, Inactive, Future Active, Unknown) | +1 commit, 13 files | none |
| 7 | `attention-first-workflow` | An "attention-first" home that leads with exceptions; changes the dashboard page and sidebar | +1 commit, 18 files | none |
| 8 | `automatic-enrollment-status` | Automatic commission status per enrollment; account-access hardening; annual/quarterly dashboard totals; Marshall approval checklist | +10 commits, 37 files | `0012` |
| 9 | `combined-review` | Client history and sync results combined for review | +2 commits, 36 files | none |
| 10 | `scheduled-sync-recovery` | Monthly (1st of the month) collection, opt-in local daily collection, interrupted-run recovery, live carrier verifications | +8 commits, 21 files | none |
| 11 | `ghl-connection-setup` | Encrypted personal and shared GHL connection setup and agent mapping | +4 commits, 16 files | `0013` |
| 12 | `ghl-contact-preview` | GHL read-only contact preview, reviewed GHL status/policy-detail writes, statement-contact linking and contact creation, per-agent GHL import automation, commission owner changes and credit splits, headless/hidden carrier browsers with an in-app verification relay, UHC/SunFire/Devoted fixes, AWS worker hosting scripts | +48 commits, 214 files, +8,864 lines | `0014`-`0020` |

Whole stack versus `Main`: **326 files changed, +13,857 / -833 lines.** Too large to review as one change.

**Check results on the tip (`ghl-contact-preview`, run 2026-11-10 in a temporary copy, since deleted):** application and worker TypeScript clean; ESLint clean; `vitest` **750 of 751 tests pass** (`worker/src/__tests__/loginDiagnostics.test.ts`, "masks every form field in an opted-in capture", fails; cause not investigated and could be an artifact of the temporary copy). Not run: `next build`, the SQL tests in `supabase/tests`, anything live. On `Main` today there are 393 tests.

**Concerns that need Marshall's decision before any of this reaches `Main`** (each verified by reading file names, migration statements or commit text, not by running the code):

1. **Scope.** SunFire enrollment collection, sales dispositions, enrollment-based commission status and "assume paid enrollments are Active" are not in the `.cursorrules` MVP scope. They need a product decision with Ryan. The attention-first home also changes what the dashboard is for.
2. **Core RLS and access (`0012`).** Redefines the shared helper functions `get_my_agency_id()`, `get_my_role()` and `can_see_direct_reports()` and replaces the `users` insert policy. Every table's RLS depends on those helpers. This is on the "needs approval" list in section 13. The branch contains a "Marshall account-access approval checklist" and a note of a local rollout; whether Marshall ever completed that checklist is not recorded.
3. **Money and attribution (`0019`, `0020`).** `0019` adds a `BEFORE INSERT` trigger on `carrier_transactions` that can change who an entry is credited to, plus triggers on `agent_earnings` and `policy_compensation_locks`. `0020` adds commission split tables and a **new read policy on `carrier_transactions`**. Ryan's answer in section 7 (#11) was "no split commissions beyond the compensation rules" for now. Changing the meaning of money, RLS or audit tables needs approval.
4. **Imports now trigger outside effects (`0017`, `0018`).** A trigger on `commission_statements` queues GHL jobs when a statement is imported, and a worker processes them. The rule that imports and approvals are separate steps still holds for money, but an import now sets off automated writes to an external CRM.
5. **Live writes to GoHighLevel.** The branch includes reviewed GHL status and policy-detail writes, contact creation, and per-agent import automation; its notes record three authorized live "Active" updates. GHL is meant to be an output target, but writing to a customer's real CRM needs your sign-off, a dry-run mode and a kill switch (I did not look for the latter two).
6. **Hosting and new technology.** About 26 files under `worker/hosting/`: AWS pilot scripts, a Go TLS relay/gateway (new language in the repo), a seccomp profile, a verification relay for a hosted worker. `.cursorrules` says hosting is Vercel plus a separate small worker host, and README section 14.5 says no real data goes on any host before HIPAA agreements. Replacing hosting needs approval.
7. **Hidden browsers and MFA.** "Keep carrier windows concealed outside verification", a headless worker candidate and an in-app verification relay change how carrier sign-in and MFA are handled. Security review needed.
8. **Scheduling.** Collection on the 1st of each month and opt-in daily collection. README section 5 lists scheduling as not built.
9. **Dependencies.** Pins `playwright` to 1.65.0 (was `^1.49.1`) and adds an npm `overrides` entry for `postcss`.
10. **Test data.** Five distinct values that match the shape of a Medicare ID appear in tests, fixtures and drill scripts (the fixture files say they are synthetic). Only one is obviously synthetic by pattern. **Confirm all five are synthetic before merge** (rule 10: no real client data in the repo).
11. **Dashboard conflict.** The stack changes `app/(dashboard)/dashboard/page.tsx`, `components/dashboard/*` and the sidebar. `feature/dashboard-filter-ui` changes the same page, so choosing one dashboard is a prerequisite.
12. **README drift.** Each branch edited an older README, so every merge conflicts there. Per section 13, conflicts must be resolved with Marshall present.

### 16.5 Suggested review order

1. Retire the three stale branches (16.2) after the payee-proof check.
2. Confirm `Main` is the same in both repositories.
3. Decide scope with Ryan: is SunFire enrollment tracking in the product? If not, slices 1-9 and `sunfire-export-test` are out.
4. Choose the dashboard (`feature/dashboard-filter-ui` versus the stack's attention-first home).
5. Review the stack bottom-up in slices, merging each only after its checklist:
   - **Slice A** (#1-#7): SunFire enrollment tracking, sales dispositions, attention-first home. No migrations.
   - **Slice B** (#8-#9): `0012` core access change. Marshall's approval checklist first.
   - **Slice C** (#10-#11): scheduled collection and GHL connection setup (`0013`).
   - **Slice D1**: GHL read-only preview and contact linking (`0014`-`0018`), with the import trigger and live writes behind an off switch.
   - **Slice D2**: commission owners and splits (`0019`, `0020`). Separate approval; likely deferred.
   - **Slice D3**: hosted worker, gateway and AWS scripts. Separate approval, after the HIPAA steps in section 14.5.
   The last branch holds D1-D3 together today, so it must be split before D2 and D3 can be decided on their own.

**Per-slice checklist (all required):** back up the local database first (`pg_dump`) and tag `Main` (`git tag pre-<slice>`); merge with `--no-ff` so it can be undone with `git revert -m 1`; never `reset --hard` or force-push; run `npx tsc --noEmit`, `npx eslint app components lib`, `npx vitest run` and `npx next build`; for migrations, apply them to a throwaway database first, run the matching files in `supabase/tests`, and only then `npx supabase migration up --local` on the working database (never `db reset`); update this README (status, functionality, changelog) in the same change; stop and ask on any conflict.
