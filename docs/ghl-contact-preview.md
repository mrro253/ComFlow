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
