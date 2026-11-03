# GHL policy update preview - November 2, 2026

Review branch: feature/ghl-contact-preview. Route: `/settings/ghl/updates`, linked from GHL setup. This is a read-only, on-demand preview. No GHL write endpoint, note creation, field creation, CRM job or ComFlow mutation is implemented by this preview.

## What it compares

For already linked applications, show the existing Medicare policy name, effective date, type, member ID and policy status beside available SunFire application information. Carrier member IDs are not MBIs; current member IDs are hidden and never substituted with an MBI. Missing application values do not clear existing fields. Unsupported/ambiguous field mappings remain explicitly unchanged.

Field definitions are read from the verified location with `locations/customFields.readonly`. Known screenshot keys are matched exactly. The previously truncated effective-date key is not guessed: its definition is selected only by the unique exact label Medicare Policy Effective Date in the contact model and verified location. Field types and relevant dropdown choices are checked before comparisons are described. Unknown types/options remain held.

## Evidence and current-policy limits

SunFire sources currently have coverageConfirmed=false and a proposed effective date. They do not establish active/current coverage, even when a date is in the past or a commission/chargeback exists. Therefore this preview has zero approved current-field changes. Equal existing values are labeled already agreeing; differences stay unchanged pending verified current coverage. Existing policy status always remains unchanged. Ultimate's user-confirmed MAPD-only offering can supply a Medicare Advantage application product label, but it does not establish coverage. Other product types are not invented.

Multiple linked applications sharing a contact remain separate and are flagged: no application is arbitrarily selected as the current policy. Older applications do not replace newer GHL dates. There is no newest-date or commission-based shortcut to current coverage.

## Draft notes

Each linked application has an enrollment reference note draft and a history-note draft for a possible future approved field change. They are never sent, queued or saved. Reference drafts explicitly distinguish application/proposed dates from proof of coverage. History drafts preserve the visible policy snapshot but do not declare it historical before an actual approved update. No full MBI, carrier member ID, token, unrelated contact data or commission amount is copied into drafts. Commission note destinations remain outside this preview's scope.

## Access and reads

The signed-in active owner/agent must have a verified self GHL-user mapping. Each contact ID comes only from that actor's scoped immutable saved link for an already-authorized enrollment. Live GET contact details must match the expected contact ID, location and assigned user. Its full MBI must agree with the current source before any policy fields are returned. Unlinked enrollments are excluded; no contact is fetched for them. The same contact is fetched once when multiple applications share it. Connection, user mapping/token and accessible source snapshots are rechecked before returning results. A failed read or changed identity discards the preview, not the existing GHL values.

HTTP uses the existing fixed HTTPS API origin, GET only, no redirects/cache, bounded response size and timeouts. The UI has no send/apply button. Only allowlisted policy fields and sanitized drafts are returned. Provider bodies, contact IDs and tokens are not returned or logged. No additional permissions beyond the existing four read scopes are needed.

Official references verified November 2, 2026:
- [Get Contact](https://marketplace.gohighlevel.com/docs/2021-07-28/ghl/contacts/get-contact/)
- [Get Custom Fields](https://marketplace.gohighlevel.com/docs/2021-07-28/ghl/locations/get-custom-fields/)

Tests cover exact identity checks, assignment/location filtering, unsupported/duplicate metadata, multiple applications, missing fields, preserving newer/current policy values and status, private identifier redaction, unlinked exclusions, changed access and one fetch per shared contact. No synthetic fixtures are inserted into the working database.

## Verification results

641 tests in 106 files and the production build passed. The real signed-in preview compared 16 linked applications, excluded the other 3, and generated 32 draft-only note previews. Across 80 policy-field comparisons, 16 already agreed, 37 explicitly preserved existing values, and 27 stayed unchanged because current coverage was not confirmed. All five intended field mappings resolved; no field type or mapping fallback was needed in this live run. Two application rows sharing a contact were flagged without selecting a current policy. Zero field changes are approved and no note was saved. All protected financial/user/audit fingerprints match the post-link baseline. No live client names, raw identifiers or screenshots were committed.
