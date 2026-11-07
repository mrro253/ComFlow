# Agent-account isolation review — November 7, 2026

Validated on `feature/ghl-contact-preview`, using the separate `commissionflow-devoted-review` Supabase project at API port 55431. No fixtures were added to staging or the working local account. Real GHL contacts and carrier portals were not accessed by these tests.

## Results

| Area | Verification | Result |
| --- | --- | --- |
| Commission visibility | Separately authenticated Agent A, Agent B and a foreign-agency owner read exact allowed entry sets. Direct agent reassignment is denied. | Passed |
| Policy ownership | The owner transfers one selected policy; dashboard credit changes for that policy alone. The original writer and amount remain intact. | Passed |
| Commission sharing | A 60/40 split of 10,001 cents credits 6,001 and 4,000 cents. Each agent reads only their own allocations, and the dashboard projection excludes the other agent's share. | Passed |
| Split safeguards | Rollback-only SQL covers signed chargebacks, future renewals, other policies, stale previews, foreign recipients, pending GHL work and compensation locks. | Passed |
| GHL setup | Agents see their mapped shared connection and their own personal connection, not another user's personal setup or a foreign location. They cannot read stored tokens or another agent's mapping. | Passed |
| GHL contacts and updates | The real import/queue/journal pipeline is exercised with every HighLevel call intercepted. Two mapped agents link/create only their credited clients and update only their assigned contacts. | Passed |
| Changed access | A reassigned GHL contact is held before another mutation. An already signed-in agent loses financial, allocation and GHL setup access when deactivated. Changed GHL mappings are checked by the queue SQL suite. | Passed |
| Repeats and recovery | Repeated imports are rejected; corrected imports and recovery after a lost successful response do not duplicate contacts, notes or field requests. | Passed |
| Working data | Before/after fingerprints match for 11 staging tables, including all 154 commission entries, ownership, shares, users, GHL records and audit history. The local working ledger fingerprint also matches. | Passed |

The database suites were `role_access`, `account_access_readiness`, `policy_commission_owners`, `policy_commission_splits`, `ghl_setup`, `ghl_statement_contacts`, `ghl_policy_operations`, `ghl_import_automation` and `ghl_agent_imports`. Each fixture transaction rolled back.

## Reproduce

Start only the separate synthetic project and apply the review-branch schema through migration 0020. The existing test runtime may have later migrations applied outside its original migration-history table; verify the actual schema before running. Never reset, migrate or seed the working or staging project for these drills.

Provide a private environment file containing the isolated project's `API_URL`, `ANON_KEY`, `SERVICE_ROLE_KEY` and `GHL_AUTOMATION_SYNTHETIC_ONLY=true`. No working tokens or client information belong in that file. Both drills refuse any API URL other than `http://127.0.0.1:55431`.

```powershell
node --env-file=<private-synthetic-env-file> --import ./worker/node_modules/tsx/dist/loader.mjs scripts/agent-account-access-drill.ts
node --env-file=<private-synthetic-env-file> --import ./worker/node_modules/tsx/dist/loader.mjs scripts/ghl-agent-isolation-drill.ts
```

The authenticated-account drill creates fictional auth identities, agencies, sources, ownership and split rules, then cleans up its generated fixtures. Docker access to `supabase_db_commissionflow-devoted-review` is required to remove only those generated agencies' append-only test audit rows in a local administrative transaction. It does not change audit protections in the application. All external requests are blocked. Passwords are random, never printed and never saved in Git.

For the SQL suites, use the same isolated container, `ON_ERROR_STOP=1` and `SET readiness.synthetic_only='on'`. Private credentials, logs and fingerprints stay outside Git.

## Remaining validation

This establishes authenticated API/database boundaries and the intercepted GHL integration workflow. It is not a new hosted multi-agent browser walkthrough, a live-provider GHL retest, or a full security audit. Those remain launch checks. No production schema changes or application permission changes were needed in this review.
