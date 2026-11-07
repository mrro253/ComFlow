# Hosted image security scan — 2026-11-07

## Minimal gateway remediation (current review candidate)

The general-purpose Caddy/Alpine gateway has been replaced with a purpose-built verification relay using **Go 1.27.3 standard library only**, compiled statically with `CGO_ENABLED=0` and shipped on pinned Distroless static Debian 13. There are no third-party Go modules, dynamic libc, package manager, shell, JWT/JWK parser, HTML parser or compression plugin in the gateway. The four affected Caddy/Alpine components are removed, not suppressed or covered by a risk exception.

The relay accepts only `POST /verification`, TLS 1.3 and JSON bodies up to 2 KiB. It forwards the exact signed bytes and three relay headers to the fixed loopback worker endpoint. It drops arbitrary cookies/auth/forwarding headers, rejects upstream redirects and non-JSON or oversized responses, bounds timeouts, and never retries uncertain submissions. It does not add an admin endpoint, browser endpoint, automatic certificates or request-body logging. Existing worker HMAC, expiry, replay and active-agent ownership checks remain authoritative.

The Go test groups and race detector cover validated TLS forwarding, byte preservation, stripped headers, route/query/encoding rejection, unsigned/duplicate headers, streamed body limits, redirect rejection, response limits and timeout behavior. `go vet` also passed during the image build with external networking disabled. The complete isolated rehearsal passed again, including a new check that TLS 1.2 is rejected and TLS 1.3 succeeds, plus MFA, agent separation, duplicate locks, abrupt restart recovery and repeat verification. No cloud resources or imported records were changed, and disposable fixtures were removed.

The exact rehearsed minimal gateway is `sha256:ea5addd1ec26f578d5eaa8e67f25ed525206fcb62e794a5601a77ffea92cdcaa` (about 15.9 MiB). Docker Scout indexed eight packages and found **zero high/critical findings**. The worker image was rebuilt only to include the additional synthetic TLS checks; its exact rehearsed identity is `sha256:664ee846c861db76d4a5508fe53fc293c66bd27ea41de45135cfd2049c30c035`. Its repeat scan indexed 1,173 packages and also found **zero high/critical findings**. Low/medium and unknown vulnerabilities are not ruled out by a high/critical-filtered scan.

| Current image | High findings | Critical findings |
| --- | ---: | ---: |
| Worker | 0 | 0 |
| Minimal verification gateway | 0 | 0 |

The four-finding remediation gate is complete without suppressions or risk acceptance. This is not approval to provision AWS or enable live carrier traffic: the concrete deployment/cost/access plan and authorized live pilot are still required. The 757 application/worker regression tests, both TypeScript checks and changed TypeScript lint passed in the separate validation copy in addition to the gateway's Go/race tests and `go vet`. No Main merge was performed.

The two image recipes pin the Go builder and Distroless runtime digests. Go source is under `worker/hosting/gateway`; its `go.mod` has no external requirements. The runtime copies Go's license and preserves compiler build metadata for scanning. The gateway build context has a source allowlist. Raw scan reports stay in ignored local `.pgtest` files.

Sources: [Go's standard HTTP library](https://pkg.go.dev/net/http), [official Go releases](https://go.dev/dl/), [Distroless documentation and supported image](https://github.com/GoogleContainerTools/distroless).

## Previous Caddy image refresh (superseded)

The review images now use Playwright **1.65.0** (matching the worker's exact dependency version) and Caddy **2.11.9**, with both upstream image digests pinned. Available Ubuntu/Alpine distribution updates were applied during the builds. The worker no longer ships global npm/npx tooling or GStreamer bad plugins used by the unused WebKit/media stack. Chromium's sandbox, non-root users, read-only filesystems, dropped capabilities and private relay remain in place.

The refreshed images passed the complete isolated rehearsal again: actual empty-queue startup, validated HTTPS, scoped MFA, replay rejection, second-worker blocking, forced-kill recovery and repeat verification. All test containers, the fixture volume and test secrets were removed afterward. The updated Playwright dependency also passed all **757 tests across 133 files** and both app/worker type checks in the separate validation copy. No imported records, live carrier/GHL data, AWS resources or deployed verification flags were changed.

The refreshed scans of the exact rehearsed images report:

| Image | Before: high / critical | After: high / critical |
| --- | ---: | ---: |
| Worker | 13 / 0 | **0 / 0** |
| Gateway | 97 / 22 | **4 / 0** |

The worker indexed 1,173 packages, with no findings in this high/critical-filtered scan. This does not assert absence of medium/low issues or unknown vulnerabilities. The gateway indexed 187 packages. Refreshed image identities are worker `sha256:f56281431ee5fdefa602a1294d7fb2a68c138f3d461294ce4b2d61fb03cf5635` and gateway `sha256:f1b2aedc5e6091376de950bc54c527697bbc8c27aba3d7f5edd7c4e0f2da1f73`.

The four gateway high findings at that stage were:

| Advisory | Component | Follow-up |
| --- | --- | --- |
| CVE-2026-116587 | go-jose/v3 3.0.5 | Scout lists no fixed v3 release; review upstream dependency migration and applicability to the fixed-certificate gateway. |
| CVE-2026-78661 | x/net 0.60.0 | Scout lists 0.62.0 as fixed; requires an updated Caddy binary/dependency build. |
| CVE-2026-116591 | klauspost/compress 1.20.1 | Scout lists 1.20.2 as fixed; requires an updated Caddy binary/dependency build. |
| CVE-2026-107891 | Alpine musl 1.2.6-r3 | Scout lists r6 as fixed, but the stable v3.24 repository still offered only r3 when checked. |

These findings were not suppressed or declared harmless. They prompted the component-removal remediation above. No applicability exception was used to pass the gate.

Official release references: [Playwright 1.65.0](https://github.com/microsoft/playwright/releases/tag/v1.65.0), [Caddy 2.11.9](https://github.com/caddyserver/caddy/releases/tag/v2.11.9). Raw refreshed reports remain ignored locally beside the baseline reports.

## Baseline scan (before image refresh)

Ryan approved Docker Scout scanning after being informed that it may send private image/package metadata to Docker. Both baseline scans completed after Docker sign-in. The baseline scan task did not rebuild or deploy images, import records, request carrier pages or update GHL. The subsequent authorized image refresh and isolated rehearsal are described above.

## Baseline decision (now satisfied by remediation above)

**Keep the hosted pilot disabled until the material base-image findings are addressed and the replacement images pass a new scan and rehearsal.** Passing the functional rehearsal and production npm audit did not establish full-image security readiness.

Docker Scout v1.26.0 scanned the locally built images with a high/critical severity filter:

| Image | High package/advisory findings | Critical package/advisory findings | Distinct advisory IDs |
| --- | ---: | ---: | ---: |
| `comflow-worker:review` | 13 | 0 | 13 |
| `comflow-gateway:review` | 97 | 22 | 110 |

These are scanner findings, not confirmed exploit paths. One advisory can affect multiple packages, so counts of findings and advisory IDs differ. Medium and low severities were outside this scan's filter. Some gateway advisories are platform- or feature-specific; no exploit testing or blanket suppression was performed.

## Worker triage

The worker image indexed 1,318 packages and flagged seven packages:

- Ubuntu GStreamer bad plugins: one high finding, with no fix listed by Scout at scan time.
- Ubuntu apt: one high finding; Scout lists a fixed package version.
- Ubuntu Brotli: one high finding; Scout lists a fixed package version.
- Global npm's bundled `undici`, `brace-expansion`, `tar` and `ip-address`: ten high findings in total. Locations are under `/usr/lib/node_modules/npm/node_modules`, rather than ComFlow's `/app/node_modules` production dependency tree.

Next steps: refresh the supported browser/Ubuntu base, apply available distribution security fixes, and remove build-time package tooling and unused browser/media dependencies from the runtime image where safely possible. Do not remove required Chromium libraries blindly. The GStreamer finding needs explicit applicability review or removal of the unused component if no vendor patch is available. Repeat the sandboxed browser, MFA and restart rehearsal afterward.

## Gateway triage

The gateway indexed 168 packages; Scout reported 20 vulnerable packages. Findings include the Caddy 2.10.2 binary and its bundled Go runtime/modules, plus Alpine OpenSSL/curl components. The largest groups were Go standard library (34 findings), OpenSSL (24), `x/crypto` (13), `x/net` (9) and Caddy itself (8).

Some examples require features this gateway does not enable (such as a file server, FastCGI or mTLS), or target another operating system. This reduces applicability for individual findings but does not justify ignoring the entire result. Refresh Caddy and the Alpine base together, preserving the non-root user, removed bind capability, exact verification route, TLS validation and disabled admin endpoint. Then rescan and rehearse before enabling live traffic.

## Scanned image identities

- Worker: `sha256:cbd3d69b4acbe0899ea9cc54b60dcc2e731512274c019f3fa4c0a028df9a61ed`
- Gateway: `sha256:0099ad8c57f0b7bcc227bd0b5503c12d483216bbab8ca387f99a7d0a40aa3cde`

Raw SARIF reports and scanner logs remain in the ignored local `.pgtest` directory; they are not committed. This summary contains no client records or secrets. These results apply to the exact image identities above and the scanner database at scan time.

See [functional hosting rehearsal](hosting-rehearsal-review.md) for the separate checks that passed. All changes remain on the review branch; no AWS resources have been created.
