# Local hosting rehearsal — 2026-11-07

Review branch: `feature/ghl-contact-preview`. No AWS resources, DNS changes, live verification flags, imports or GHL updates were made.

## Result

The worker and HTTPS gateway passed a local container rehearsal. Both ran without root, with read-only root filesystems and all host capabilities dropped. Chromium's own sandbox was explicitly enabled. The worker had Docker networking set to `none`; the gateway shared that isolated network namespace. No ports were published. The only database was a small loopback HTTP fixture returning synthetic users, a synthetic connection and empty work queues. All carrier-page requests were intercepted and fulfilled locally.

Verified in the built image:

- The actual worker startup loaded successfully and processed an empty queue without scheduling collection.
- TLS certificate validation succeeded through the gateway on localhost:8443. Certificate checks were not disabled.
- Only the verification path was forwarded. Unknown paths, unsigned requests, replayed requests, inactive users, other agencies and other connections were rejected.
- Text delivery, code entry and hidden completion worked using the real headless browser and production verification handlers. No full browser, report, login page or debug port was exposed.
- A second worker sharing the state volume exited with the lock-busy status before starting work.
- An abrupt worker kill preserved its journal. Restart recorded one interruption notice in the synthetic fixture without restarting collection automatically. Verification worked again after restarting the gateway.
- Test containers, the local test certificate/key and the disposable fixture volume were removed after completion. The public images/build cache remain locally for repeat runs.

## Fixes found during rehearsal

Containers can reuse process IDs after restart. A kernel-held `flock` now protects the shared state volume, and the runtime can distinguish Linux process start times when that container guard is present. Use a stable worker hostname and one shared state volume; this is not a distributed multi-host lease. Windows desktop locking remains unchanged. The container entrypoint uses no-fork mode so signals reach the worker directly.

The gateway's binary had a file capability incompatible with dropping every capability and forbidding privilege gains. The review gateway image removes that capability and uses port 8443 as UID 1001, matching the browser image's worker user. The browser security profile permits its namespace-local `chroot` syscall; host capabilities remain dropped. No privileged container, SYS_ADMIN capability or unconfined security profile was used.

The initial dependency audit found a critical issue and high-severity issues. Compatible lockfile updates moved Next.js to 15.5.29; a targeted PostCSS 8.5.32 override removes its vulnerable nested copy. The production npm audit now reports **zero findings**. Fresh dependencies were installed in a separate validation copy, leaving running local installations untouched. All **757 tests in 133 files**, app/worker type checks, changed TypeScript lint and the production app build passed using that copy and synthetic connection settings.

The separate full-image Docker Scout scans were subsequently approved and completed. They found material high/critical issues in the base images and bundled tooling, so the hosted pilot remains disabled pending remediation and a repeat scan. See [scan results and triage](hosting-security-scan-review.md). The zero-finding production npm audit does not cover operating-system packages or global tooling.

## Repeat locally

From the repository root, run `./worker/hosting/rehearse.ps1` in PowerShell with Docker Desktop running. It builds both review images, creates only the fixed `comflow-hosting-rehearsal` project, exercises verification and crash recovery, then removes that project's containers and fixture volume in `finally`. It requires no Supabase project, credentials or private environment files. Do not modify it to load staging secrets or enable external networking.

Configuration lives in `worker/hosting/compose.rehearsal.yaml` and `Caddyfile.rehearsal`. The worker image is about 4.15 GiB locally; leave sufficient disk for image updates and rollback copies. This is a functional rehearsal, not a production load or capacity test.

## Remaining before AWS pilot

1. Address the material findings from the completed full-image scans, then rescan and rehearse the replacement images.
2. Review the concrete AWS instance, encrypted disk, access controls, HTTPS hostname/certificate, secrets, logging and monthly cost with Ryan before provisioning. No sample certificate or rehearsal key may be used online.
3. Replace `network_mode: none` with reviewed outbound connectivity and expose only the authenticated HTTPS gateway. Configure real TLS and a restart/health policy. Never publish browser, debug or relay ports directly.
4. Stop the local worker for the same queue before starting the hosted instance. One host/one worker remains the supported deployment.
5. Run one authorized live carrier/MFA pilot, verify imported totals and duplicate protection, and confirm unknown challenges remain blocked. Keep hosted verification disabled until that pilot is ready.

Sources: [Playwright's Docker guidance](https://playwright.dev/docs/docker), [version-matched security profile](https://github.com/microsoft/playwright/blob/v1.64.0/utils/docker/seccomp_profile.json), [Caddy reverse proxy reference](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy), and [Docker seccomp guidance](https://docs.docker.com/engine/security/seccomp/).
