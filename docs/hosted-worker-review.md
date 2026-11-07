# Hosted downloader preparation — review only

Update: the local container/gateway rehearsal and its image-refresh repeat both pass. See [hosting rehearsal results and remaining pilot gates](hosting-rehearsal-review.md). Latest [high/critical image scans](hosting-security-scan-review.md) show worker 0/0 and gateway 4/0. The four remaining gateway findings require remediation or explicit assessed acceptance before the actual AWS/carrier pilot.

The website is on Vercel and records are in Supabase. The remaining hosting component runs the carrier browser without the agent's computer. No AWS resources have been created by this change.

## Implemented

- `CARRIER_BROWSER_MODE=hosted` starts Chromium headless, without a desktop window. Desktop remains the default.
- Opt-in in-app MFA supports recognized text/call delivery buttons, resend and a single security-code field. It returns only normalized choices; no carrier HTML, screenshots, login forms or remote desktop is exposed. Unknown challenges stop safely. This has not had a live hosted carrier pilot.
- A container definition installs locked dependencies and runs as a non-root user. The Docker build context uses a source allowlist; environment files, downloads, diagnostics and Git history are excluded.
- Manual Sync now remains the intended workflow. The image defaults scheduling off; do not override it.

## Private verification in ComFlow

The agent sees an in-app code field or supported delivery choices only. The website authenticates the agent and checks that the carrier connection belongs to that exact active user before every verification action. The worker independently checks the active user, role, agency and connection owner. Agency owners cannot operate a teammate's verification session. Signed requests expire after 20 seconds and are accepted once; form tokens rotate after actions. Browser sessions expire after 30 minutes. Codes are never logged or saved by this interface.

Only known MFA controls on allowlisted HTTPS carrier origins are enabled. Password screens and supported CAPTCHA indicators block actions. The original verification origin must agree. Reports, downloads, arbitrary navigation, remote desktop and browser debugging are never exposed. The login flow disables verification on completion; a completed sync removes its panel. Unsupported carrier wording or multi-field codes need an adapter change rather than a generic browser fallback.

Before enabling: finish a container/gateway deployment rehearsal and an authorized live pilot. Validate each carrier's actual verification labels, including error and resend screens. Synthetic tests cannot prove those live layouts.

### Configuration (leave off until pilot)

Both website and worker require `HOSTED_VERIFICATION_ENABLED=true` and the same privately generated 32-byte base64 `WORKER_VERIFICATION_KEY`. Store the key as a server-only secret, never a `NEXT_PUBLIC_` variable. The website also requires `WORKER_VERIFICATION_URL=https://<private-worker-host>/verification`. Redirects and non-HTTPS URLs are rejected.

The hosted worker uses `CARRIER_BROWSER_MODE=hosted`. Its relay listens only on `127.0.0.1:8080` (`WORKER_VERIFICATION_PORT` can override the port). A same-host HTTPS gateway must forward only `/verification` to that loopback listener. In Docker, use a gateway sharing the worker's network namespace; do not bind the relay to a public interface or publish a browser port. A synthetic-only gateway rehearsal is now included; the real deployment remains disabled. Do not configure the web flag until the gateway and worker are ready. Never log relay request bodies at the gateway.

The web and worker flags remain unset in existing staging. Existing desktop collection behavior is unchanged.

## Proposed AWS pilot — not deployed

Use one worker instance initially, with an encrypted persistent state disk, outbound HTTPS, and no public browser/debugging ports. Store secrets outside Git and the image. Do not run the local worker against the same queue during the pilot: the current lock is local to a machine, not a distributed lease. Do not scale to multiple instances until distributed claims and recovery are implemented and tested.

The preliminary worker budget discussed was roughly $40–60/month; verify the selected instance, disk, network, logging and any agreement requirements before approval. No paid resources should be created from this document alone.

Build candidate from repository root: `docker build -f worker/Dockerfile -t comflow-worker:review .`. Do not supply live secrets during image build. A production run also needs a writable `/state` volume owned by the container user, private runtime secrets, resource limits and a restart policy. The local build/rehearsal passed; actual AWS runtime verification remains pending.

## Release gates

Review validation: 757 tests across 133 files passed, including signed-request tampering/replay/expiry, exact owner checks, server-derived agent identity, stale form rejection and hidden normal/password pages. A real headless Chromium smoke test used three locally intercepted sample pages to exercise text delivery, code submission and hidden completion; no carrier requests were sent. The actual React panel also passed a synthetic mobile browser check for submission, code clearing and width, with built app styles visually inspected. App/worker TypeScript checks, changed-file ESLint and the production build passed. Container build and a live hosted carrier test remain pending.

1. Validate the supported MFA interface against each carrier during the authorized pilot; unsupported challenges remain blocked.
2. Address the completed full-image scan findings and rescan; repeat startup/shutdown/recovery checks in the actual AWS pilot environment. The local synthetic rehearsal passed.
3. Review concrete AWS resources and monthly cost with Ryan before provisioning.
4. Run one live pilot, confirming only verification is visible and no duplicate imports occur.
5. Preserve the existing local worker until the pilot passes, but never poll the same queue concurrently.
