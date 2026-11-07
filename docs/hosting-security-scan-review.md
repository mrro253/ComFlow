# Hosted image security scan — 2026-11-07

Ryan approved Docker Scout scanning after being informed that it may send private image/package metadata to Docker. Both scans completed after Docker sign-in. No image rebuild, deployment, import, carrier request or GHL update was performed during this scan task.

## Decision

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
