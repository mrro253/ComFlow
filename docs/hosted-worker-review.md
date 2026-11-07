# Hosted downloader preparation — review only

The website is on Vercel and records are in Supabase. The remaining hosting component runs the carrier browser without the agent's computer. No AWS resources have been created by this change.

## Implemented

- `CARRIER_BROWSER_MODE=hosted` starts Chromium headless, without a desktop window. Desktop remains the default.
- Hosted MFA stops with a clear error. It cannot expose a general browser as a fallback. **The in-app MFA interface is not implemented yet.** Do not enable this mode for agents requiring verification.
- A container definition installs locked dependencies and runs as a non-root user. The Docker build context uses a source allowlist; environment files, downloads, diagnostics and Git history are excluded.
- Manual Sync now remains the intended workflow. The image defaults scheduling off; do not override it.

## Next implementation: private verification in ComFlow

The agent should see an in-app code field or supported delivery choices only. The website must authenticate the agent and check that the carrier connection belongs to that exact active user before every verification action. The worker must independently enforce that scope and reject expired sessions and replayed requests.

Only known MFA screens on allowlisted carrier origins may be exposed. Password screens, reports, downloads, arbitrary navigation, remote desktop and browser debugging must never be exposed. Security codes must not be logged or persisted. Hide verification immediately after it succeeds. Unknown challenges must stop safely.

Before enabling: test agent separation, session expiry, duplicate submissions, code delivery transitions, unsupported challenges and interrupted verification using synthetic fixtures, then one authorized live pilot.

## Proposed AWS pilot — not deployed

Use one worker instance initially, with an encrypted persistent state disk, outbound HTTPS, and no public browser/debugging ports. Store secrets outside Git and the image. Do not run the local worker against the same queue during the pilot: the current lock is local to a machine, not a distributed lease. Do not scale to multiple instances until distributed claims and recovery are implemented and tested.

The preliminary worker budget discussed was roughly $40–60/month; verify the selected instance, disk, network, logging and any agreement requirements before approval. No paid resources should be created from this document alone.

Build candidate from repository root: `docker build -f worker/Dockerfile -t comflow-worker:review .`. Do not supply live secrets during image build. A production run also needs a writable `/state` volume owned by the container user, private runtime secrets, resource limits and a restart policy. Container build and AWS runtime verification remain pending.

## Release gates

Review validation: seven focused browser tests, worker TypeScript checks, changed-file ESLint and Git whitespace checks passed. Tests use mocked browser controls; they do not prove the container or live hosted carrier flow works.

1. Implement and test the private MFA interface.
2. Build and scan the container; test startup, shutdown and recovery with an isolated database.
3. Review concrete AWS resources and monthly cost with Ryan before provisioning.
4. Run one live pilot, confirming only verification is visible and no duplicate imports occur.
5. Preserve the existing local worker until the pilot passes, but never poll the same queue concurrently.
