# Combined review — November 2, 2026

Branch: `feature/combined-review`, based on the latest `feature/automatic-enrollment-status`. Publish the same branch to both Ryan's and Marshall's repositories. No Main merge, database change, carrier login, download, import, correction or assignment is part of this integration.

## Branch comparison

| Earlier review work | Disposition |
| --- | --- |
| Client commission history | Integrated the read-only history service, pagination, access tests and entry-details panel. |
| Statement totals check | Integrated complete-read totals checks, statement-detail card and overview; link stays within Imported statements. |
| Carrier sync results | Integrated private operational result persistence and authorized retrieval for future carrier runs. Preserve newer queued-state priority and label the saved result as a previous recorded run. |
| Statement review queue | The current attention-first worklist already verifies repeat sources, separates imported copies and includes private Devoted pairs. Preserve this newer implementation instead of adding a competing queue. |
| Devoted import approval/review | The limited paired importer is already included; compared parser, workbook, service and migration files with the earlier review branch. Earlier pending-approval documents are historical, not a second activation gate. |
| SunFire enrollment collector | Its three commits have equivalent patches in the current history; retain the integrated collector and app sync. |
| SunFire CSV export experiments | Preserve the original branches as research history. The later enrollment-detail collector supersedes this source for matching; do not add a second collection path to the UI. |
| UHC standalone downloader | Preserve research history. Current app sync already uses the newer downloader and header validation; do not restore the older command or overwrite its later fixes. Live UHC sign-in remains paused. |
| Dashboard, automatic statuses and access security | Retained from the integration base, including graphs, monthly/quarterly/annual controls, separate applications and migration 0012 already applied locally. |

## Behavior and limits

- History groups only session-visible active entries by carrier, member identity and credited agent/writer. It does not merge identities across carriers or expose another agent's records. The query is a POST action; client fields do not enter history URLs.
- Totals compare the carrier's statement total with the complete readable entry sum plus the separately reported previous-statement amount. Missing/incomplete/unsafe values show unavailable, never an invented zero. Superseded statements are explicitly historical.
- Sync summaries contain only connection binding, carrier, timestamps, outcome and counts. Session authorization precedes privileged storage retrieval. Counts remain unknown for interrupted runs; result-storage failure does not discard saved statement files.
- Results appear only after a future run with the updated worker. No live sync was performed. SunFire continues reporting verified enrollment collection results, not statement download counts.
- Existing automatic enrollment statuses remain derived from imported evidence. Scheduled collection and hosted deployment are not enabled by combining these features.

## Validation

- 566 tests in 90 files pass, including imported feature tests and existing automatic-workflow regressions.
- Worker TypeScript and application ESLint pass.
- Production build passes. Combined preview runs at `http://localhost:3011`; unauthenticated Dashboard, Commission activity, Enrollments, statement checks and carrier pages redirect to login, and the report API returns 401.
- Read-only fingerprints of working statements, carrier entries, commission entries, users and audit rows match the pre-integration baseline.
- Authenticated visual walkthrough of the newly combined screens has not been performed; earlier feature-branch checks are not claimed as a new walkthrough.
