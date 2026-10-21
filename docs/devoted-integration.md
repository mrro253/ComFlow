# Devoted Health integration status

Updated 2026-10-21. Download-only development phase; not enabled for import, scheduled sync or the production carrier picker.

## Observed source flow

Ryan signed in to `https://agent.devoted.com/` using its Devoted Auth0 flow. My Commissions is at `/commissions`. It lists pay-period dates, Credits, Debits, Balance, Total Paid, PDF links and spreadsheet links, with 25-row pages and next-page controls. The inspected account showed 55 periods. Only one approved PDF/spreadsheet pair was downloaded for local format inspection, using the authenticated browser. No other periods were downloaded and no financial records were imported.

The independent Playwright worker implementation is in `worker/src/carriers/devotedDownload.ts`, with the explicit one-period command in `worker/src/devotedDownloadOnce.ts`. It does not import or call the Ultimate adapter, use the polling sync registry, or access Supabase. Authentication is interactive in a fresh worker browser; complete login/MFA normally. It does not save credentials, cookies or sessions. Unattended login and scheduling remain unbuilt.

The worker scans visible table pages, requires exactly one requested pay-date row, validates the two HTTPS destinations against the observed Devoted file host, bounds file sizes, rejects redirects/login HTML, and downloads both sources before saving a complete pair manifest. It hashes file contents, reuses verified identical files, and never overwrites conflicting existing content. Signed query tokens and original filenames are not included in logs or the local manifest. HTTP 408/429/5xx responses have bounded retries; other failures stop with a safe message. A partially written local pair is not an imported commission and can be retried. Spreadsheet checks establish only the expected ZIP workbook container, not a complete workbook parse.

## Format findings and import blocker

- The PDF is a Commission Payment Statement: pay date, payment-period range, summary totals/counts and transaction columns Agent, MBI, Member, Effective, Contract, Amount, Period, Type, Disenroll, Cancel.
- The inspected PDF does not supply the carrier Member ID. An MBI must not be mislabeled or stored as `carrier_member_id`.
- The spreadsheet supplies 22 columns: Statement Date, Agent NPN, Agent Name, Member ID, Member HICN, Member First, Member Last, Member State, Signature Date, Effective Date, Disenroll Date, Contract, PBP, Prior Plan Type, CMS Cycle Year, Commission Type, Period, Base Amount, Admin Amount, Total Payment, FMO, Payment Notations.
- The inspected spreadsheet downloaded with an `.xls` filename but contains an OOXML ZIP workbook. Detect contents rather than relying on filename extension.
- PDF and spreadsheet need to be retained and verified together. Statement date, payment period, effective date and the row's commission period are different source concepts; do not substitute one for another.
- The first approved PDF and workbook totals were compared locally. One simple renewal sample does not verify chargebacks, adjustments, bonuses, multiple-agent statements or all historical layouts.

No statement parser is registered yet. Import must remain unavailable until the paired-source parsing, reconciliation, duplicate/correction identities and storage provenance are implemented and tested. Do not map Devoted automatically to Ultimate's product or commission categories.

## Local command (explicitly approved periods only)

From `worker/`, with existing worker dependencies and Chromium installed:

```powershell
npm.cmd run devoted:download -- --date YYYY-MM-DD --output "C:\Users\ryan\Documents\Devoted-Private-Downloads"
```

Use a real requested pay date instead of the placeholder. Output must be an absolute directory outside the repository. The command opens a worker browser; sign in and open My Commissions within three minutes. Only the specified pay period is fetched, and ambiguous dates require review. Obtain explicit download authorization before running against a real account. Keep all source files private and out of Git, issues, fixtures and shared logs.

## Validation and next phase

Public/signed-in navigation and the approved sample downloads were inspected in the app browser. The new worker command itself is **not yet run end to end against the live portal**. Synthetic tests cover source validation, signed-token-independent link identity, pagination, missing/ambiguous dates, paired-file failures, and local duplicate/overwrite handling. App and worker TypeScript checks, ESLint and all 250 Vitest tests pass (including 12 new Devoted tests). No live run of the new worker command is claimed.

Marshall review is required before adding a workbook-reading library or changing source-storage/schema/audit meaning. Prepare paired-source persistence and parser design for that review; do not register a placeholder parser or treat an unsupported source as zero commissions. Later work includes encrypted unattended login, approved MFA handling, full statement-details display and scheduling after explicit authorization.

Freedom/Optimum remains a separate planned shared-portal adapter. The inspected Agent Statement page returned No data available; no Freedom/Optimum source was imported or registered as supported.
