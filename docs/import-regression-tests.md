# Synthetic repeat-import and correction regressions

Verified 2026-10-21 for Ultimate Health Plans, UnitedHealthcare and Devoted Health.

## What ran

The shared synthetic cases pass PDF bytes through the installed extractor and carrier parser, then use the actual duplicate/correction planners and import payload builder. Devoted uses the synthetic paired workbook cells; actual OOXML reader/formula/container rejection remains covered by the existing workbook suite. No downloaded carrier files or working records are inputs to these tests.

- Exact source replay proposes no new rows.
- A regenerated single PDF with identical economics and the same filename is a duplicate. With no same-filename source context, economic matches are held for review. A changed Devoted pair for the same verified pay date/payee requires explicit correction approval, even when economics are identical.
- A recognized correction proposes its complete revised entries, preserving the original object. Devoted server approval rejects a correction without explicit approval, accepts a fresh approved preview and rejects changed context.
- Empty and non-PDF sources fail with explanations. Existing tests cover corrupt/unsupported PDF layouts and workbook archives/formulas/external links.

Generated SQL then exercises the production import functions on the isolated synthetic Supabase project: first import, repeat rejection, a valid correction, retained original rows, corrected active totals, preserved attribution and supersession audit. Deliberately invalid corrected rows force failure after correction processing starts; parent/source/ledger/audit changes roll back and the original remains active. Devoted retains metadata for both original and corrected source pairs. The SQL transaction rolls back every synthetic agency, user, statement and ledger row.

This verifies supported parser/planner/database cases. Browser upload/corrected-file retrieval and competing single-PDF correction approvals were not exercised here. Single-PDF recognition still requires the existing filename/month/owner context and at least 50% economic-row overlap; a changed filename or insufficient overlap is not a guaranteed automatically detected correction. No production behavior or business rule was changed.

## Safe reproduction

Use only the separate synthetic project `commissionflow-devoted-review`, ports 55431–55434, with migrations through 0011. Never run the SQL against `supabase_db_commissionflow` or point test configuration at the working project. A refusal guard additionally rejects existing carrier entries without the synthetic SYNTH- prefix.

1. Run `npx vitest run` and the required TypeScript/ESLint checks.
2. From the repo root, run `node worker/node_modules/tsx/dist/cli.mjs --tsconfig tsconfig.json scripts/make-import-regression-fixtures.ts`.
3. Pipe `.pgtest/statement-import-regressions.sql` into `docker exec -i supabase_db_commissionflow-devoted-review psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q`.
4. Require PASS for each carrier and the final rollback notice. Do not run the SQL file alone: it needs the generated synthetic fixture input.

## Result and working-data proof

347 tests, application TypeScript and ESLint pass. All three database cases pass, including repeat rejection, corrected active totals, preserved history and atomic failure rollback.

Before/after read-only fingerprints match for the working statement, carrier transaction, paired-source metadata, agent earnings, audit, writing-agent alias and production-entity tables. The 26 imported statements / 149 entries, 18 paired-source rows and all assignments remained unchanged. No working-data migration, correction, import or deletion was performed by this test phase.
