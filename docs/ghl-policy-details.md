# Reviewed GHL policy details

Settings > GoHighLevel > Policy updates now offers a separate **Review plan details update** action. It groups changes to Medicare policy name, effective date and policy type for one contact, shows every old/new value and the exact history note, and requires explicit approval before sending. Preparing and previewing never write to GHL. Existing status updates remain separate.

Eligibility requires an accessible saved full-MBI contact link, one linked application for the contact, and current supported Paid evidence. Future application dates, newer existing policy dates, invalid/ambiguous field mappings, and different existing plans without a verified old date are blocked. Plans with an old verified date can be replaced only through explicit review. Application details remain identified as application information, not carrier-verified current coverage.

Plan and effective date come from the matched SunFire application. Medicare Advantage is currently inferred only for Ultimate, whose product scope Ryan confirmed. Other carriers keep their existing policy type until explicit source mapping exists. Existing dropdown options must contain the proposed value; no options or fields are created. Unchanged values are omitted. A single request contains only the changed custom field IDs and values; personal information, MBI, member ID, status and unrelated fields are omitted.

The history note preserves each changed field's exact prior value (including Blank), requested value, application reference and payment month. It is saved and reconciled before the field request. Journal migration 0015 adds a private details payload and enforces one open operation per contact across status/details updates. Leases, current assignment checks, source/payment snapshots, changed-field checks, readback and operation-marker note reconciliation remain active. Partial outcomes can resume only while each target field is still the reviewed old or requested new value; unrelated outside edits pause recovery. A lost successful response does not duplicate the note or field write.

GHL does not provide an atomic note-plus-fields transaction here. Immediate rechecks cannot prevent an outside concurrent edit between reads and writes. No bulk/background sending, automatic rollback, hosted migration or Main merge is included.

Validation: simulated grouped writes and recovery, full regression suite, production build, and isolated rollback-only SQL authorization/history/locking tests. The local database was backed up before applying 0015; imported financial/source/user/audit records remain unchanged. No real plan-detail fields or new history notes were sent during development. A live per-contact details pilot still requires review and approval.

API contract: [HighLevel Update Contact](https://marketplace.gohighlevel.com/docs/2021-07-28/ghl/contacts/update-contact/) uses PUT with customFields entries containing id and fieldValue. Date values are proposed as YYYY-MM-DD; live date round-trip verification remains part of the first approved pilot.

## Concise notes — 2026-11-03

New reviews use: Updated by ComFlow (review date in Eastern time), Previous plan with its effective date, termination date and type, then Changed to with new plan, effective date and type. The complete previous plan details are included even when only the name changes. Termination is read only from one unambiguous DATE field named Medicare Policy Termination Date or Medicare Policy Term Date. Missing/ambiguous/invalid termination dates show Not available; a new effective date never implies the old plan terminated. Termination fields are not written. No carrier name is invented when no existing carrier field is mapped. The operation reference remains for duplicate-note prevention.

Existing completed notes are not edited. Older prepared/paused operations retain their original note format so exact note reconciliation and approved hashes remain valid. New reviews bind the concise format and policy snapshots to their reviewed hash. No schema migration is required.
