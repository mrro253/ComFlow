# Devoted import implementation for Marshall's review

Prepared 2026-10-21. Branch: `feature/devoted-import-review`. **Do not merge or apply migration 0011 to the working database before review. No real commission imports are authorized by this branch.**

## What is built

- Exact `read-excel-file@9.3.9` dependency and lockfile; Node-only workbook reader. No new worker integration or scheduled login.
- Bounded OOXML validation: 15 MiB compressed source, 64 MiB expanded archive, max 1,000 archive entries / 50,000 detail rows. Reject legacy XLS, encrypted/ZIP64/unsafe archives, CRC mismatches, external links, formulas, embedded binary parts and ambiguous numeric member/writer identifiers. The reader receives a freshly constructed stored ZIP containing only validated bounded XML, not the original compressed package. Cached formulas are deliberately rejected too, a stricter choice than the earlier proposal.
- Pure paired parser: verifies payee/pay date, payment-period range, one detail identity (writer NPN/name, MBI, member first/last, effective date, contract, amount and period/type), workbook components, both summaries and adjustments. Carrier Member ID comes only from workbook Member ID; NPN never enters the carrier payee-ID field.
- Initial supported layout is intentionally **one page / one monthly-renewal row per pair**, matching all nine saved 2026 pairs. Multiple rows, chargebacks, overrides and other categories are blocked pending verified layout work. This is a limited Devoted adapter, not a universal parser. Zero-dollar supported renewal events stay informational. A blank printed PDF bonus is supported only alongside the verified zero workbook bonus and full summary reconciliation.
- Owner-only `/statements/devoted` dual-file preview. It displays all 22 workbook fields, pay date, period, source status, totals, assignment and duplicate/correction state. Preview reads agency context without creating aliases, entities, sources or transactions.
- Default-off import approval. A server HMAC binds the preview to the actor/agency, source pair, assignments and existing source context. Approval reparses the submitted bytes and rejects changed context or files. A correction requires an explicit checkbox; ambiguous revisions block import. Selected files survive preview without requiring another download.
- Private immutable object paths use agency + pair hash. Uploads never overwrite an object; existing bytes are rechecked. Partial upload failure leaves evidence private but creates no database statement. No automatic source deletion.
- New migration `0011_devoted_paired_sources.sql`: paired metadata, source table, partial PDF uniqueness for other carriers, Devoted pair uniqueness, immutable sources, owner-only source-metadata RLS, and service-only atomic registration/import. It preserves old single-PDF import semantics behind a private implementation and blocks Devoted from the generic PDF RPC. The Devoted RPC serializes payee/pay-date revisions and checks stale previews under the lock. Corrected rows remain superseded, never deleted. No earnings calculation is added.
- Payment details re-read both private sources after session/RLS entry authorization, recheck identity/hashes, and return only that entry's 22 fields plus pay date/period. Product remains Unknown unless separately verified; prior plan type is not used as current-product proof.

## Deviations / decisions to review

1. The owner-only first pilot is narrower than the eventual Independent owner-profile flow. Nonowners cannot upload/approve Devoted in this version. Existing Ultimate permissions are unchanged.
2. Registration and commission import happen in one RPC **after** the source files are uploaded. Read-only preview does not register a pending statement. There is no importable incomplete pair; orphan private uploads require controlled reconciliation, not deletion.
3. `devoted_payee_hash` and `parser_version` accompany source metadata. Payee hash scopes correction detection, not writing-agent assignment. Payee context has to be reverified for future variants that expose a separate payee account ID.
4. Full-source metadata for Devoted is owner-only, stricter than the generic parent statement visibility. Entry details still use the normal session/RLS boundary.
5. The Server Action body limit rises from 10 MiB to 32 MiB so two individually bounded 15 MiB files fit. Review hosting memory/time limits before deployment; this is not a hosted production readiness claim.
6. Source registration/import returns one statement ID; parsed row details remain in private immutable sources rather than a new client-data JSON column.
7. No general parser registration, normal worker polling, bulk import or unattended download is enabled. The separate Devoted worker downloader remains unchanged.

## How to review safely

Use a separate checkout and a **separate synthetic Supabase project**. Never point this review build at Ryan's working database or copy real statements into Git.

1. Install app and worker dependencies (`npm ci`, `npm ci --prefix worker`).
2. Start an isolated Supabase project with separate ports. Apply migrations through 0011 there only and use its seed accounts. Recheck the next free migration number before any future merge; never edit old migration files.
3. Put only the isolated project's settings into ignored `.env.local`. Default settings in `.env.local.example` keep `DEVOTED_REVIEW_ENABLED=false` and `DEVOTED_IMPORT_REVIEW_ENABLED=false`.
4. For read-only UI testing, set only `DEVOTED_REVIEW_ENABLED=true`. Sign in as the synthetic owner, then open `/statements/devoted`.
5. Generate synthetic files from the repo root: `node worker/node_modules/tsx/dist/cli.mjs --tsconfig tsconfig.json scripts/make-sample-devoted.ts`. Files appear in ignored `.pgtest/`.
6. Preview that PDF/XLSX pair. Confirm source status, 22 fields, $28.91 total, pay date, assignments and the disabled import notice. A wrong/missing/tampered source must not import.
7. Only in the isolated synthetic environment, enable `DEVOTED_IMPORT_REVIEW_ENABLED=true` to exercise approval/storage/RPC and dashboard details. Never enable this against the working ledger before Marshall's approval and Ryan's specific import approval. Disable it again after testing.
8. Run app/worker TypeScript, ESLint, Vitest and production build. Run `supabase/tests/devoted_pair_import.sql` and `supabase/tests/role_access.sql` against the isolated database; both are rollback regressions. The Devoted test expects only synthetic/demo data and never belongs on a live project.

Local read-only file check (no DB, upload or import): `node worker/node_modules/tsx/dist/cli.mjs --tsconfig tsconfig.json scripts/preview-devoted-private.ts <private-directory-outside-repo>`. It checks hash-named manifests/files and prints dates/counts/totals only; never source rows or client names. Do not paste private source data into issues/logs.

## Verification and remaining gates

Verification: 299 Vitest tests, app/worker TypeScript, ESLint and production build pass. Migration 0011 ran only on an isolated synthetic Supabase project; paired rollback and existing role-access regressions pass. Two competing approvals produced exactly one success and one stale rejection. Synthetic owner browser preview/import/private storage/activity/24-field details (22 source columns plus pay date/period)/personal production and ordinary-agent denial were verified. Import flags are restored off after testing. Corrected-source and partial-upload paths are tested in SQL/unit tests; their browser variants remain unverified. All nine private saved 2026 PDF/workbook pairs were independently reconciled read-only: **9 rows / 26,019 cents**, no imports. Real writing-agent assignments and import previews still require owner review. No real client fixtures or private artifacts are included here.

Dependency audit of the review lockfile reports **21 findings: 5 moderate, 15 high, 1 critical**. No audit entry names `read-excel-file`, `saxen`, `fflate`, `worker-f` or `unzipper-esm`; this does not certify those dependencies safe. Existing app dependency findings remain unresolved and require separate review; no force-upgrade was performed. Worker audit reports zero findings.

Before merge: approve dependency, schema/uniqueness/RLS/audit changes and the decisions above; inspect the lockfile; recheck migration numbering. Before real import: re-read the nine private sources in a real authorized preview, review attribution/corrections, obtain Ryan's approval, record baseline totals, and verify the existing Ultimate ledger stays unchanged. Do not infer coverage status, T65, compensation or GHL updates from this import.
