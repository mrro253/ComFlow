# Devoted local import activation

## Authorization and scope

On 2026-10-21 Ryan explicitly instructed: "Marshall hasn't approved but import devoted anyways. We'll take it out later if there is an issue." This overrides the earlier review-first gate for this local implementation/import. Marshall has not approved it. The historical proposal and review documents remain available; this activation is Ryan-authorized, not evidence of Marshall's approval.

The implementation was ported onto current Main, retaining UHC and Ultimate parsing and source details. Exact read-excel-file@9.3.9 and migration 0011_devoted_paired_sources.sql are included. No old migration was edited. The paired source metadata, owner-only source RLS and existing import wrapper changes are described in devoted-import-review.md.

The verified scope remains one PDF page / one monthly-renewal entry per PDF/workbook pair. Other categories/layouts are held for review. Prior plan type is not used to infer current product. No compensation, GHL, bank-deposit verification or unattended carrier login is added.

## Recovery preparation

Before migration or real import, a PostgreSQL custom-format database dump, global roles dump and complete private statement-storage copy were saved outside Git under Ryan's Documents/ComFlow-Backups directory. Keep these private. Existing financial rows were not deleted or replaced. If an issue appears, disable the local Devoted flags, preserve evidence and inspect the affected import before deciding on a correction or restore; do not drop migration 0011 or delete audited source records casually.

## Local setup

Apply migration 0011 only after checking the next free migration number and backing up the target. The working local project was at 0010 and migration 0011 was applied with the Supabase CLI. Set DEVOTED_REVIEW_ENABLED=true and DEVOTED_IMPORT_REVIEW_ENABLED=true only in the ignored local environment for the owner-operated flow. Committed example values remain false. Owner-only manual preview/import is at /statements/devoted. Sources stay in the private statements bucket with immutable pair identity; no source PDFs/workbooks or client values belong in Git.

## Verification and result

- 326 synthetic tests, application/worker TypeScript, ESLint and production build pass. The combined detail-access tests cover Devoted source context and preserve UHC/Ultimate behavior.
- Paired-import SQL and nine-role RLS regressions passed against the separate synthetic project and rolled back; they were not run against real data.
- All nine saved January–September 2026 PDF/workbook pairs were hash-verified and reconciled before import: 9 entries / 26,019 cents. Existing name/alias context assigned every entry to Ryan's personal production. No attribution was guessed or added by this operation.
- Owner-authorized local batch processing used the existing pure parser/preview/assignment logic and atomic paired-source RPC, rechecking context immediately before each import. No corrections were proposed or applied. Both persisted sources were downloaded and reverified after each import. Repeating preflight reports nine already-imported pairs.
- Local activity filter shows nine Devoted entries; client names and all 24 detail fields were verified through the signed-in app. Existing ledger aggregates remain Ultimate 94 entries / 1,110,416 cents and UHC 46 entries / 133,032 cents. Agent earnings remain empty.

This establishes a local import result, not hosted readiness or a live Devoted portal test. Carrier downloads remain separate from this change.
