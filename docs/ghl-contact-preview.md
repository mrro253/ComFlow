# GHL contact preview - November 2, 2026

Review branch: `feature/ghl-contact-preview`. No Main merge, migration or record imports.

## Behavior

Settings > GoHighLevel > Preview contact matches opens `/settings/ghl/preview`. Reads run only after pressing Run read-only preview. No background sync, linking, contact mutation, notes, policy status inference or database writes are implemented. Preview results remain in the current page state; they are not saved to browser storage or the database.

The current preview supports the owner-managed sub-account with an explicit self GHL-user assignment. Even an owner must have their own mapping; owner status never grants an unrestricted contact preview. Separate personal connection preview is not enabled. Agents see only enrollments they can already access through the existing sale service.

The server obtains connection metadata and the requesting user's mapping through their RLS session before accessing ciphertext with the server client. It verifies current GHL location membership, then checks returned contact location and assignedTo before processing candidate information. It rechecks the signed-in account and saved assignment/connection/token after remote reads. Removed access, upstream errors or changed mappings discard the entire result. No client-supplied agency, actor, contact ID, connection or token can override this scope.

## Matching limits

This is a bounded **name-search candidate preview**, not an exhaustive identity search. Each enrollment application remains separate. Up to 100 accessible enrollments are supported. Each documented contact GET query returns at most 100 results; a full page or larger reported count is explicitly incomplete. Failed queries are unavailable, never unmatched. Alternate names, missing names and contacts assigned to other agents may not appear. No candidate found does not establish that the client is absent from GHL.

Exact normalized full names produce name candidates. Duplicate candidates stay ambiguous. Full MBIs are compared only if one verified contact field definition has the exact screenshot key `contact.medicare_number_mbi`, contact model, correct location and a valid field ID. Member ID fields are not substituted. Full normalized 11-character IDs only; masked/partial/blank values never count as agreement. Missing field access/definition leaves the run name-only with a warning. Even MBI agreement does not save a link or prove that a policy took effect.

Only names, enrollment context, candidate evidence and status reach the browser. No raw full MBI, contact payload, token, contact ID, email, phone, SSN or unrelated custom-field values are returned/logged. Requests use a fixed HTTPS origin, GET only, no redirects/cache, bounded response size and per-request timeout. Errors do not echo provider content.

## API and permissions

Required: `locations.readonly`, `users.readonly`, `contacts.readonly`. Optional for full-MBI evidence: `locations/customFields.readonly`. No write permission is required.

- [Get Contacts](https://marketplace.gohighlevel.com/docs/2021-07-28/ghl/contacts/get-contacts/): documented name query, locationId and limit. This legacy read endpoint is deprecated; it is used for the bounded first preview because the current Search Contacts reference delegates its filter request schema to an externally rendered document. Do not guess ownership filters. A future switch to Search Contacts needs verified pagination/filter contracts and the same response ownership checks.
- [Get Custom Fields](https://marketplace.gohighlevel.com/docs/ghl/locations/get-custom-fields/index.html): field IDs, fieldKey, model and location binding.
- [Search Contacts](https://marketplace.gohighlevel.com/docs/2021-07-28/ghl/contacts/search-contacts-advanced/index.html): preferred future replacement after confirming its full request contract.

## Verification

Unit tests cover partial/full identifiers, duplicate identities, different applications, conflict evidence, wrong-user/location filtering, incomplete pages, API errors, exact field resolution, authentication/access failure, changed assignment, output redaction, and authorization before privileged credential access. No synthetic fixture is inserted into the user's database. See the review commit for final regression/build results and live-test limitations.

Live verification: 618 tests in 101 files and the production build passed. The signed-in local preview read the real saved connection and checked 19 enrollments: 15 name candidates and 4 without an exact full-name candidate in the mapped user's contacts. MBI field comparison remained unavailable; no MBI match is claimed. Protected statement, carrier-entry, commission-entry, user and audit fingerprints were identical before and after the preview. No field permissions were changed by ComFlow, and no client names or identifiers are included in this report.

Follow-up live verification after the user added `locations/customFields.readonly`: the exact Medicare Number field resolved in the verified location. All 15 name candidates had agreeing full MBIs; the other 4 enrollments had no exact-name candidate within this mapped user's contacts. No identity conflicts or duplicate candidates appeared in this bounded run. Nothing was linked or written; the protected-record fingerprint remained unchanged. No raw identifiers or client names are stored in this review note.

Usability update: the preview now labels confirmed results as "Contact Matched in GHL" and unsuccessful name queries as "No Contact Found in GHL." A summary counts enrollments with matching contacts, enrollments without a contact found, and enrollments needing confirmation. Counts refer to applications, not unique people. Name-only, conflicting, duplicate and incomplete results retain separate plain-language labels. Matching logic, access restrictions and read-only behavior are unchanged.

Unmatched-contact investigation: an optional read-only button repeats the current authorized preview, then broadens only the unmatched enrollment queries to first-name and last-name searches. Results remain restricted to the mapped GHL user and verified location. Full-MBI agreement under a different name is labeled separately and is never promoted into a confirmed full-name match. Duplicate MBIs, incomplete pages and provider failures remain unresolved. These searches cannot establish that a client is absent from the entire location and do not reveal other agents' contacts. No links or updates are saved.

Live broader lookup: of the 4 previously unmatched applications, 1 had the same full MBI under a different GHL name and remains explicitly in need of confirmation. The other 3 had no agreeing MBI in these first-name/last-name searches of the mapped user's contacts. The original 15 exact name/full-MBI matches remain unchanged. No links or writes occurred; protected record fingerprints still match. Focused tests (10) and production build passed. No client names or MBIs are included in this review note.

## ComFlow-only enrollment linking

The preview now supports a separate explicit Link enrollments in ComFlow action. Preview reads remain non-mutating. On linking, the server regenerates contact/MBI evidence, verifies the reviewed digest, active session, self GHL mapping, current enrollment sources and individual sale access. Client input is only a review hash, not identities or agency authority. Only unique agreeing full MBIs from complete searches are eligible; partial IDs, duplicates, conflicts and missing contacts are skipped. A shortened name with an agreeing full MBI is disclosed explicitly in the review before linking.

Links use immutable `ghl.enrollment_link_confirmed` records in the existing audit trail; no migration or new permission is needed. Each event retains agency/actor, connection/location/GHL user, source owner/collection/application reference, GHL contact reference and evidence basis. Names and full MBIs are not copied into audit. A deterministic primary key binds one application/actor/connection slot; a conflicting contact cannot overwrite it. Identical retries skip existing links, including concurrent identical inserts. Applications with different codes remain separate even when the same client has multiple applications. Different source versions retain original link provenance; a changed identity is not silently relinked.

Writes are append-only per enrollment. If a run stops midway, the UI explicitly warns that some links may already be saved; refreshing and retrying resumes without duplicates. Access is rechecked before every write, including existing sale-assignment authorization. No GHL write method is called, and financial/source enrollment rows are never updated. Current link status is shown only after the authenticated preview has revalidated current identity evidence and access. Local links do not infer coverage, change policy statuses or enable CRM synchronization.

Linking verification: 627 tests in 103 files and the production build passed. The live local workflow regenerated the broader review, confirmed the same 16 eligible application/contact identities (including one shortened name with an agreeing full MBI), and saved 16 append-only ComFlow links. The remaining 3 enrollments stayed unlinked. Database verification found 16 distinct link IDs/application codes with fresh-full-MBI evidence and no copied name, MBI or token keys. Statement, carrier-entry, commission-entry and user fingerprints were identical before/after. Only the intended audit/link records were added. No GHL contacts, statuses or notes were changed. No client names, live contact IDs or identifiers are included in this review note.

## Saved GHL links on Enrollments

The Enrollments page now shows a saved GHL connection badge alongside the existing commission badge. Linked, not linked, connection not configured, user not assigned, link needing recheck and temporarily unavailable remain distinct. A GHL link does not imply that a commission was paid. The existing Paid / Not paid yet / Charged back / No commission expected calculations and manual Sync now collection remain unchanged.

The display reads only local connection metadata, the requesting user's own mapping, and their saved audit/link references for already-authorized applications. No token is decrypted and no GHL API is called by this page or its automatic refresh. Privileged audit reads are scoped to agency, actor, action, enrollment entity and deterministic IDs derived from the visible applications. Raw contact IDs, MBIs and tokens do not enter the display model. Missing permissions/configuration never reveal another user's links.

Recollection with a new snapshot keeps an application's link when its original source fingerprint agrees. Changed source evidence, changed GHL-user/location bindings, unavailable prior source authorization and malformed link records are shown explicitly rather than silently treated as linked. A link-status error is isolated from commission derivation, so the commission view continues to work. No data is written by this display.

Enrollment-display verification: 633 tests in 104 files and the production build passed. The real signed-in Enrollments page shows 16 saved GHL links and 3 not linked alongside the unchanged commission categories (8 paid, 7 not paid yet, 3 charged back, 1 no commission expected). All protected financial/user/audit fingerprints match the post-link baseline, so displaying the page added or changed no records. Tests also verify no GHL fetch on link-status reads, safe stale-source handling, separate applications and commission availability during GHL-status failure. No client names, identifiers or screenshots were added to Git.
