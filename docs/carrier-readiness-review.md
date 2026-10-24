# Carrier readiness review — October 23, 2026

Review branch: `feature/automatic-enrollment-status`. Main was not changed.

**Result:** Existing source reconciliation, duplicate/correction protection and tested active-user isolation pass. Access-policy fixes are prepared and verified on the separate synthetic project. Marshall should review those fixes and approve migration `0012_active_account_access.sql` before a wider rollout. It has **not** been applied to the working database.

## Existing records: read-only verification

`scripts/check-imported-statements.ts` reparsed the saved source files, verified hashes and paired identities, and compared imported transaction keys, member references, effective dates, categories, amounts, counts and printed totals. It refuses hosted URLs and requires an explicit agency scope. It makes no database writes and never logs client fields or source filenames.

| Carrier | Active imported statements | Monetary entries | Result |
|---|---:|---:|---|
| Ultimate Health Plans | 10 | 99 | All saved sources and totals reconcile |
| UnitedHealthcare | 10 | 52 | All saved sources and totals reconcile |
| Devoted Health | 9 | 9 | Both files and pair identities verify; totals reconcile |
| Total | 29 | 160 | Pass |

Zero-dollar carrier events remain in the original source and are intentionally not monetary ledger entries. Prior-statement amounts are reconciled separately rather than misrepresented as new commission entries. No carrier portal was visited, no sync request was submitted, and no imported record was edited.

## Duplicate and correction safeguards

The existing synthetic parser/planner cases and the actual database import functions were rerun on `commissionflow-devoted-review`, API/database ports 55431/55432. The working project at 54321/54322 was not used for these writes.

- All three carriers reject exact repeat imports without adding entries.
- Recognized corrections preserve original rows and history, while active totals reflect the corrected version.
- Deliberately invalid corrections roll back parent, source, ledger and audit changes.
- Devoted corrections require explicit approval, retain both source files and reject stale previews. Source metadata remains immutable.
- All SQL regression fixtures roll back.

This is evidence for the supported formats, not a guarantee that every possible corrected layout is recognized. Existing single-PDF recognition depends on filename/month/owner context and economic overlap. Unknown layouts must remain reviewable rather than be treated as no commission. Devoted's current importer is limited to its explicitly supported single-row renewal pair format.

## Real authenticated synthetic accounts

A separate copy of the review app ran on port 3012 with only the synthetic project's configuration. Real temporary auth accounts exercised the rendered Next.js routes, API routes, CSV export and multipart Server Actions using their own cookie jars. This did not replace the owner's browser session or create test accounts in the working project.

Verified:

- Owner, manager, Career agent, Independent agent and another agency receive exactly their expected database rows.
- Career, Independent and manager commission pages include permitted clients and exclude the other agent's client, including serialized page data.
- Another agency receives no fixture clients.
- Shared PDFs are denied to ordinary agents, an Independent who does not own that shared file, and a different agency. Authorized owner PDF access is private/no-store.
- Agents see only assigned enrollments. An assigned agent can save a required explanation, with an attributed audit entry.
- Forged writes to another agent's enrollment and writes after assignment revocation fail without appending an outcome.
- After recollection and a later payment, the original application retains No commission expected and the new application independently becomes Paid.
- Agent CSV exports exclude another agent's policy.
- Managers cannot manage carrier logins; Career agents receive no credential form.
- Inactive sessions lose database financial/statement access, protected pages redirect to login and protected API requests return unauthorized after the reviewed fixes.
- An unprovisioned login cannot insert an Owner profile into another agency after the reviewed fixes.
- Legitimate trusted signup provisioning still succeeds; browser access to its privileged RPC is denied after explicit grant revocation.

Temporary readiness accounts, agencies, source files, assignments and outcomes were removed from the synthetic project. Its pre-existing seed fixtures were retained. Immutable audit protection was restored within the scoped synthetic cleanup transaction. No such cleanup or trigger change was performed on the working project.

## Access findings and review-only fixes

These were reproduced with synthetic sessions, not merely inferred from comments:

1. **Inactive profiles retained access through valid auth sessions.** Existing database authority helpers did not check `active`, and the shared application user lookup also accepted inactive profiles. The migration adds the database checks; `getCurrentUser` now fails closed and login clears a session when no active profile is available.
2. **A login without a profile could choose its agency and Owner role.** The old self-insert profile policy allowed this. The replacement permits only an active agency Owner to insert a teammate into that Owner's own agency. Legitimate signup uses trusted server provisioning instead.
3. **The signup provisioning RPC retained explicit browser grants.** Revoking PUBLIC alone did not remove Supabase's inherited explicit anon/authenticated grants. The migration explicitly revokes all three and retains service-role execution. The synthetic test reproduced browser execution before the fix and verified denial plus successful trusted provisioning afterward.

Changes are in `supabase/migrations/0012_active_account_access.sql`, with rollback regressions in `supabase/tests/account_access_readiness.sql`. Existing role and all-carrier import regressions also pass after the revised policy. Recheck migration numbering/order against other branches before merging.

**No working-project migration, user deactivation, profile change, import, correction or reassignment was performed.** Application guards are on the review branch; direct database policy protections require the reviewed migration to be applied later.

## Connection results

Queued requests previously could still show Connected from an earlier result. The review UI now gives queued work priority, displays waiting-for-worker text, separates running work from errors, and labels verification/sign-in review as needing attention. These states were checked on synthetic connection rows and in unit tests. No carrier login or verification was attempted.

Remaining limitations:

- Exact per-run downloaded/unchanged/failed counts are not durably saved for every carrier. The app does not claim “nothing new” when it cannot establish that. Persisted result summaries remain a follow-up before broadly unattended operation.
- Collection still uses Sync now and a running worker. Scheduled collection is not enabled.
- UHC's live sign-in/verification reliability remains paused at the user's request. This check does not claim that the portal issue is fixed.
- Review-branch work is not merged or deployed, and Marshall's approval is not implied.

## Verification and safe reproduction

- Full unit/regression suite: **532 tests pass**.
- Application production build includes type/lint validation; worker TypeScript is checked separately.
- `supabase/tests/statement_import_regressions.sql`, `devoted_pair_import.sql`, `role_access.sql` and the new account-access regression pass on the synthetic project. The new regression requires an explicit `readiness.synthetic_only='on'` session setting and migration 0012.
- For all-carrier SQL input generation and isolated commands, see `docs/import-regression-tests.md`. Never point those tests at `supabase_db_commissionflow`.
- To recheck saved working sources read-only, set the local Supabase environment and `READINESS_AGENCY_ID`, then run `node worker/node_modules/tsx/dist/cli.mjs --tsconfig tsconfig.json scripts/check-imported-statements.ts`. Output is aggregate verification/counts only; an unavailable source fails the check rather than reporting zero commissions.
- Before/after fingerprints of the working imported statements, carrier entries and commission records must match. The private local comparison records are excluded from Git.

Recommended next gate: Marshall reviews the access changes and migration rehearsal before a wider rollout. Then add one carrier at a time, verifying source totals and a repeat sync before moving on. Live portal checks should be explicitly scoped and are separate from this readiness exercise.
