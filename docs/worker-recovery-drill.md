# Interrupted-worker recovery drill — November 2, 2026

Review branch: `feature/scheduled-sync-recovery`. Main unchanged. Scheduling remains disabled.

Verification: the isolated process drill passed twice; all 597 unit/regression tests, application and worker TypeScript, and application ESLint pass. Working statement, carrier-entry, commission-entry, user and audit fingerprints match the private baseline. The synthetic runtime was stopped after cleanup; the working app/database were left running.

## What ran

`worker/src/recoveryDrill.ts` exercised the actual local journal/lock, database claim, private source storage, recovery function and worker startup code against `commissionflow-devoted-review` at API port 55431. It created only fictional fixtures in a new test agency; the working project at 54321 was not used. The synthetic carrier has no registered portal adapter and no saved credentials.

1. A separate Node process acquired the real runtime lock, flushed an in-flight journal, claimed a queued request and saved a synthetic PDF source.
2. A second runtime acquisition was rejected while the child was alive.
3. The parent forcibly terminated that child after its saved-source checkpoint, without graceful cleanup.
4. The **actual worker entry point** restarted with `--once`, reclaimed the dead-process lock and recovered the journal. It recorded Update interrupted and processed zero portal jobs; no credential read/login was necessary.
5. The saved file's bytes/hash were unchanged and only one statement row existed.
6. A newer explicit request was preserved by recovery. The test then explicitly claimed/resumed that request and the existing storage function returned duplicate, without a second statement row.
7. A completed result and a disabled connection were each preserved unchanged. No carrier or commission transaction rows were created.
8. The test removed only its own synthetic agency/auth account, source and temporary runtime directory. Pre-existing synthetic fixtures were retained.

## Reproduce safely

Start the separate synthetic project and provide its service-role key in a private environment file **outside Git**, with:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:55431
SUPABASE_SERVICE_ROLE_KEY=<isolated-project-key>
RECOVERY_SYNTHETIC_ONLY=true
```

From the repository root, with the worker dependencies installed:

```powershell
node --env-file=.pgtest/recovery-test.env worker/node_modules/tsx/dist/cli.mjs --tsconfig tsconfig.json worker/src/recoveryDrill.ts
```

Alternatively `npm run test:recovery` in `worker/` accepts these variables from its environment. This command deliberately does **not** automatically load the working `.env.local`. It rejects missing explicit opt-in and every API URL except exactly `http://127.0.0.1:55431`; it also refuses to run if that synthetic project already has queued connection requests.

The local runtime path is an isolated temporary directory, not the working worker's state. Only child processes created by the drill are stopped. Printed results contain no keys, clients or source contents. This file's example key is a placeholder; never commit actual environment files.

## Interpretation and limits

This verifies recovery across a real process termination, persisted database/storage state, a dead OS-process lock, the actual restart entry point and repeat storage. It does not simulate power loss, filesystem corruption, network outages at every instruction, remote/distributed workers or carrier MFA behavior. Existing unit tests cover additional date, state and compare-and-set edge cases.

Recovery intentionally pauses an unfinished claimed run for explicit Sync now; it does not blindly resubmit passwords. A computer and worker still need to run on the first day of the month for the disabled-by-default monthly scheduler to collect statements once enabled. This drill neither activates that schedule nor imports any commission statement.
