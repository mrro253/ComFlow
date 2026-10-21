# Devoted statement import approval

For Marshall. Prepared 2026-10-21. **Review proposal only: approve or amend the decisions below before implementation is merged or any migration is applied.** No library is installed, no schema is changed, and no Devoted entries are imported by this branch.

## Requested decisions

| Decision | Recommendation | Approval |
| --- | --- | --- |
| Workbook reader | Add exact `read-excel-file@9.3.9` as a server-only app dependency; commit its lockfile and review dependency audit results | Pending |
| Source storage | Preserve PDF and OOXML workbook as one immutable private source pair, with hashes and a complete-pair manifest | Pending |
| Schema and uniqueness | Add paired-source metadata; allow a new Devoted revision when only the workbook changes while preserving other carriers' existing PDF uniqueness | Pending |
| Import validation and duplicate scope | Require both sources, reconcile all money, use pay date for statement month, and distinguish verified separate pay periods from duplicate/corrected sources | Pending |
| Delivery gate | Synthetic tests and read-only previews first; Ryan separately approves real imports after reviewing all nine statements | Pending |

Suggested reply: approve decisions 1-5, or list amendments. Approval of the design is **not** approval to import real commissions, enable unattended login, schedule downloads, or update GHL.

## Evidence already available

The separate Devoted worker downloaded all nine available 2026 PDF/workbook pairs, January-September, with zero failures. Local manifests and file hashes were checked. The workbooks share one 22-column header layout and contain nine detail rows, all labeled `Renewal - Monthly`, totaling 26,019 cents. The initial PDF/workbook sample reconciled at 2,891 cents. Reconciliation of all nine PDFs is still an import acceptance check, not a claimed completed validation.

The PDF transaction table supplies MBI, member name, writer, effective date, contract, amount, period/type and coverage-related fields, but not the carrier Member ID. The workbook has Member ID, Member HICN, client names, Agent NPN/Name, statement/effective/signature/disenrollment dates, contract/PBP, commission period/type, component amounts, Total Payment, FMO and notations. The sample downloaded with an `.xls` extension but its contents are an OOXML ZIP workbook.

Real sources remain in private local downloads, outside the repo. Do not attach them to GitHub. Current production-facing local ledger baseline: **94 entries / 1,110,416 cents**, unchanged. The 254-test suite covers the existing app and downloader; it does not establish that the proposed parser or migration works.

## 1 Workbook reader

Recommend `read-excel-file@9.3.9`, imported only through `read-excel-file/node` behind the service/I/O layer. The published metadata specifies MIT licensing and Node >=18. Its documented `parseNumber` option can preserve numeric cell strings, so the existing integer-cent money parser can validate them without floating-point arithmetic. The reader returns cached formula results rather than calculating formulas. Sources: [maintainer documentation](https://github.com/catamphetamine/read-excel-file#numbers), [maintainer package metadata](https://github.com/catamphetamine/read-excel-file/blob/master/package.json). Version and direct dependencies were independently checked with the npm registry on 2026-10-21.

Proposed direct package addition: exactly `read-excel-file: 9.3.9`, not a floating range. Current declared transitive ranges are saxen ^11.1.0, fflate ^0.8.3, worker-f ^0.1.12 and unzipper-esm ^0.13.3; the implementation lockfile must capture the resolved versions and integrity values. No Python runtime is added to the app. Local Python inspection is not the production parser.

Before merge: inspect the resolved dependency audit and Node/Next compatibility; do not run force-upgrades. Limit each compressed source to 15 MiB, total expanded workbook XML to 64 MiB, and detail rows to 50,000; block over-limit or malformed inputs with safe messages. Demonstrate enforceable expanded-size limits with the chosen reader/wrapper; if that needs another direct dependency, obtain an amended approval. Reject encrypted/legacy binary XLS, unsupported layouts and missing required/cached values. Do not run macros, calculate formulas, follow external workbook links or silently round invalid money. Treat identifiers as text; ambiguous numeric identifiers or dates require review.

## 2 Immutable paired sources

Keep `commission_statements.storage_path` and `file_hash` as the primary **PDF path and PDF SHA-256**. Do not repurpose those existing fields as workbook data or a pair digest. Ultimate's parser and stored sources must retain their current meaning.

Add a `commission_statement_sources` table with these proposed fields:

| Field | Constraint/purpose |
| --- | --- |
| agency_id, statement_id | Required; composite FK to the same agency's statement; add parent unique (agency_id, id) if needed |
| source_kind | Required enum/check: `pdf` or `workbook`; unique (statement_id, source_kind) |
| storage_path | Required private object path, scoped to agency and immutable source revision |
| sha256 | Required 64-character lower-case hex digest |
| byte_size | Required positive integer <=15 MiB |
| media_type | Validated PDF or OOXML workbook type, independent of original filename extension |
| created_at | Required timestamp, server-assigned |

Add nullable `source_pair_hash` (SHA-256), `statement_pay_date` (date), and payment-period start/end dates to `commission_statements`. Legacy records keep null values and are not rewritten. Proposed pair identity: SHA-256 of a versioned canonical tuple `["devoted-pair-v1", pdfHash, workbookHash]`; parser-version metadata is recorded separately and does not make an identical source a new import.

RLS for source metadata must mirror the parent statement's existing agency/role visibility, with service-only writes. Users allowed to view a single commission entry must not gain access to every client in a shared workbook/PDF. Full-source download routes must use the existing statement authorization boundary; per-entry details are returned only after session/RLS row checks. Source rows become immutable after registration; corrections add a new statement/source pair rather than editing or deleting old evidence. Store both objects in the existing private statement bucket and permit the workbook MIME type only if necessary after checking the live bucket configuration.

Upload both objects and validate their hashes before registering the complete pair and metadata in a database transaction. Storage and database writes are not one atomic transaction: on a storage/registration failure, leave no importable incomplete statement, retain private uploaded evidence for controlled reconciliation, and report the failure. Do not automatically delete existing objects or backups in this phase.

## 3 Uniqueness and corrected statements

The current `(agency_id, file_hash)` uniqueness identifies a PDF. It would incorrectly prevent recording a corrected workbook if the accompanying PDF is unchanged. Approval is requested for a **new migration** that replaces this with:

- Existing PDF-hash uniqueness for non-Devoted statements, using a partial unique index. Preserve legacy behavior and data.
- Devoted uniqueness on `(agency_id, source_pair_hash)`, with constraints requiring a complete pair hash/pay date for Devoted registrations. The same PDF and workbook pair cannot be registered twice.
- Existing PDF-hash-only lookups in `lib/repositories/statementRepository.ts` and `worker/src/db.ts` must stay on their current path for single-PDF carriers; a Devoted registration must instead look up its pair hash. Do not call a PDF-only `maybeSingle` lookup when several Devoted revisions can share that PDF. Review all duplicate-conflict handling alongside the new indexes.

A changed PDF or workbook creates a new candidate revision. Match corrections using verified payee context and pay date, not filename, totals or client name alone. Any ambiguous match blocks import for manual review.

Per-row identity should use a versioned pair hash, all source identity fields and an occurrence counter for legitimately repeated rows. Economic duplicate review must include verified payee and **pay date** for Devoted: two distinct payments in the same calendar month must not be silently merged just because member/category/amount match. Preserve existing Ultimate behavior. Extend the planner's typed context/repository reads rather than weakening its protections globally.

Superseding requires an explicit review preview and the existing atomic replacement behavior: retain old statement/entries, flag them superseded, and exclude them from current reports. No delete/rewrite of past commissions. A changed workbook with an unchanged PDF, changed filename with identical content, and separate pay dates with identical amounts all need dedicated regression tests.

## 4 Parsing, reconciliation and assignment

Keep the existing layers: UI -> server actions -> services -> repositories; pure normalization/reconciliation/matching rules in `lib/carriers/devoted/`. Browser automation remains entirely in `worker/`.

1. Read stored PDF and workbook, verify both stored hashes and the pair digest on every preview/import. Match statement/payee context and compatible row evidence across the two sources, including summary count/amount and detail identities. Never match sources only because the totals happen to agree.
2. Validate the exact required workbook columns and supported PDF layout. Preserve all 22 source fields, the PDF summary and both source-row references for details/history. Keep raw client data in private source storage; return detail fields only for permitted ledger entries, using a verified source-key mapping.
3. Parse decimal source strings to signed integer cents. `Total Payment` is the carrier-reported row amount; Base/Admin are preserved as source evidence, not recomputed compensation. Reconcile detail sum to workbook summary and PDF summary, including credit/debit signs and counts. Unsupported bonus, balance or adjustment discrepancies block the entire statement; never invent balancing transactions or silently discard rows.
4. Map exact `Renewal - Monthly` to canonical `RENEWAL` while retaining the printed label. Other labels, first-year/T65/plan-change distinctions, chargebacks, overrides and non-row payments require explicit tested rules/evidence; unknown monetary categories block import until reviewed. Do not reuse Ultimate's assumptions or derive compensation from commission amounts.
5. Use workbook **Member ID** for carrier_member_id; keep Member HICN/MBI distinct. Missing Member ID blocks the relevant statement; do not substitute MBI, name or a fabricated identifier.
6. Set statement_month from the verified pay date (YYYY-MM). Preserve payment-period range, row commission Period, effective date and statement date separately; none substitutes for another. Include the actual pay date in preview/details so two payments in a month remain distinguishable.
7. Attribute production from the explicit writing Agent Name/NPN evidence. A payee alone proves no writer. Do not put an NPN into the existing carrier payee-ID field or guess a cross-carrier ID match. Use established unique name/alias matching, with manual confirmation for ambiguity; any future persisted NPN mapping needs an approved per-agency design. Owner-written business stays personal production, and Independents create no agency payout obligation.
8. Preserve the current zero-dollar informational-row policy, owner-gated assignment/import access and separate earnings approval. No rate, promotion, compensation, coverage-status or GHL changes are part of this proposal.

## 5 Atomic approval and visible preview

A Devoted upload/select-source flow must require both files and clearly show pay date, period, PDF/workbook source status, counts, category totals, reconciled total, writing-agent assignments, unassigned entries, duplicates, corrections and blockers. No preview may write commission transactions. The first real review should use the nine saved pairs, requiring no new portal downloads.

The server must re-read/rebuild the preview at approval time; never trust submitted browser amounts, paths, hashes or assignments. Lock the statement, verify its agency/status and complete immutable pair, recheck uniqueness, then import all permitted rows and any explicit supersession in the existing atomic transaction. A stale preview, changed source, missing pair or duplicate approval must roll back without partial commissions. Record source-pair identity, parser version and actor in the audit trail; do not put client names, MBIs or raw rows into shared logs/audit summaries.

Extend `import_statement` or add a narrowly scoped Devoted registration/import function through a new migration, preserving its service-only grants and current Ultimate behavior. Exact RPC signature and reviewed migration SQL are required before deployment. The migration is **not included or applied in this proposal**; use the next free number (currently after 0010), recheck immediately before merge, and never edit old migrations.

## Planned implementation files

- `package.json`, `package-lock.json`: approved reader only.
- New numbered `supabase/migrations/NNNN_devoted_paired_sources.sql`: sources/metadata/uniqueness/immutability/RLS/import guards and grants.
- `types/database.ts`, `lib/repositories/statementRepository.ts`: typed paired-source registration and authorized retrieval, plus pay-date duplicate context.
- `lib/pdf/` and a server-only workbook reader: source I/O/format extraction; keep pure calculations outside these modules.
- `lib/carriers/devoted/`, `lib/carriers/types.ts`, registry: strict parser, pair reconciliation and source identity; preserve existing single-PDF carriers.
- `lib/services/statementService.ts`: dispatch verified paired previews/imports without changing layer boundaries. Keep the existing single-PDF parser interface operational for Ultimate; use an explicit typed paired-source interface for Devoted, with no fake fallback parser.
- Statement upload/review actions/components: dual-file selection, evidence/blocker preview, approval gate.
- Payment-detail service/repository and reporting types as needed: authorized 22-field display and pay date, preserving integer-cent totals and owner/personal grouping.
- Synthetic fixtures/tests, README and this review document: accurate verification and migration/setup notes. Real source files stay out of Git.

## Acceptance and rollout gates

| Check | Required result |
| --- | --- |
| Synthetic parser/pair tests | Positive/negative/zero money, exact decimals, missing fields, different source dates/payees, wrong/missing workbook, unknown labels and summary/row mismatches fail safely |
| Duplicate/correction tests | Same pair imports once; workbook-only correction is reviewable; repeated rows preserved; separate pay dates never silently collapse; concurrent approvals produce no duplicates |
| Source privacy/RLS tests | Wrong agency denied; unauthorized agent cannot open shared sources/other entry details; source tampering and unsafe paths rejected |
| Failure tests | Partial uploads cannot import; stale previews/changed sources roll back; retry cannot repeat earnings or delete history; compressed/expanded limits enforced |
| Migration rehearsal | Run against an isolated synthetic database; preserve all Ultimate fixtures, constraints, visibility, immutability and totals |
| Required checks | App/worker TypeScript, ESLint, all Vitest tests; production build for changed pages/routes; targeted owner/agent browser verification |
| Real read-only preview | All nine saved pairs reconcile independently; expected workbook input is nine renewal rows / 26,019 cents, subject to verified PDF pairing, assignment and duplicate review |
| Real import | Ryan approves the specific preview(s); record before/after counts/totals and audit events. No download/design approval substitutes for this |
| Dashboard acceptance | Devoted rows, client details, categories, month filter, source pay date and personal/agency split match the approved preview; Ultimate totals unchanged |

Roll back deployment by disabling Devoted registration/import and reverting application code as appropriate; preserve evidence and financial history. Do not drop populated tables, run database reset, delete sources or reverse commissions automatically. Any applied-data correction needs a reviewed forward migration/adjustment under existing audit rules.

## Review scope and current state

Approve this design before installing a dependency, changing schema/uniqueness/RLS/audit behavior, or merging the implementation. This branch contains documentation only and remains separate from Main for Marshall's review. Existing app TypeScript, ESLint and all 254 tests pass; no new library, parser or migration is being claimed as tested. No carrier downloads, production migrations, GHL writes, scheduled syncs or commission imports are performed by this review package.
