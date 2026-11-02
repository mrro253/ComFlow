# Local scheduled syncing and recovery

Review branch: `feature/scheduled-sync-recovery`. November 2, 2026.

## Current activation state

Built and tested with synthetic fixtures; **not enabled** in the working configuration. No live portal, worker startup, sync request or import was performed. The existing signed-in app remains available. The next live collector run needs a deliberate scope, especially if carrier verification might be required.

## Scheduling rules

- Default: off. Set `SCHEDULED_SYNC_ENABLED=true` in the worker environment and run the long-lived worker to opt in. The sample environment retains `false`; no real configuration was edited.
- Ultimate/Devoted commission statements: run only on the first day of each calendar month in `SYNC_SCHEDULE_TIMEZONE` (default `America/New_York`), once per month. A same-month prior attempt suppresses another automatic attempt. The worker must run on that day; if it is off all day, use Sync now or wait until the next first day. No automatic catch-up on other days. SunFire enrollment collection keeps its separate rolling 24-hour schedule.
- Only Ultimate Health Plans, Devoted Health and SunFire are eligible. UHC remains excluded; ordinary explicitly requested UHC runs still use the existing manual-request flow.
- An inactive or missing connection owner, pending/disabled/attention connection, malformed/future timestamp, or already queued request prevents automatic queueing.
- Recheck owner agency/active state before queueing and owner active state again before portal execution. Queue updates compare the observed status, last-attempt time and absence of another request.
- Read all eligible connection pages, failing closed if a complete scan cannot be established. `npm run once` never creates scheduled requests, even if the opt-in setting is true.
- This collects source files or enrollments. It does not import commission statements or change financial records. Existing review and duplicate safeguards remain in place.

## Interrupted-run handling

The local runtime directory is under the current OS user's local application data (`ComFlow/worker/<database-origin-hash>`), outside source control. State stores only a connection UUID, run timestamp and process-lock metadata. It contains no credentials, names, member IDs, source contents or portal sessions. Loopback URL aliases share the same database scope.

The runtime writes and flushes the journal **before** claiming a request, and clears it only after completion/status persistence. A restarted worker checks the journal first:

1. A crash before the claim leaves the queued request in place.
2. A claimed run without completion receives an interruption notice and needs explicit Sync now to resume.
3. A completed success, recorded failure, disabled connection or newer queued request is left alone.

Recovery uses the observed last-attempt timestamp, status and error text as guards; it never clears a newer request or changes imported records. Status-write errors now propagate rather than allowing a false successful checkpoint. Existing downloaded files remain available.

## Local worker lock and operating limits

- Run exactly one updated worker, under one OS account on one machine, per database. Stop older worker versions before switching; old versions do not participate in the new lock protocol.
- An exclusive lock rejects a second updated worker. A confirmed dead local process lock may be reclaimed with serialized recovery. Live, foreign-machine, corrupt or ambiguous locks fail closed.
- If a process ID is reused, the conservative check can require operator inspection. A crash during the tiny lock-recovery window can likewise leave a recovery marker requiring inspection. Never remove locks until the associated worker is confirmed stopped.
- Do not place runtime state on a synced/network folder or run workers on multiple machines. The lock is local, not a distributed database lease. Hosted scheduling requires a separate deployment and distributed-claim design.
- Keep runtime state between restarts. Removing it loses interruption discovery for already-claimed requests. Source files remain preserved independently.
- Polling is sequential. A verification screen can delay later connections until completed or stopped; there is no unattended MFA handling or automatic verification-code resend.
- Credential/verification failures require explicit attention and do not automatically repeat. Unexpected worker errors are logged generically without raw database/source messages.

## Verification

586 tests across 93 files pass, including 17 scheduling/recovery synthetic cases for monthly eligibility, timezone boundaries, separate enrollment scheduling, paused UHC, attention states, invalid dates, active-owner scoping, competing queue updates, interruption guards, completed-run preservation, private journal durability, corrupt/foreign state and duplicate local workers. Worker TypeScript and application ESLint pass. No new dependency or database migration is introduced.

The tests do not log in to a carrier, emulate real MFA or start the production worker. Live scheduling/restart verification remains unperformed. A read-only comparison of working statement, carrier-entry, commission-entry, user and audit fingerprints must remain identical before publishing.
