# Reviewed GHL status pilot

The review branch supports one explicitly approved contact at a time under Settings > GoHighLevel > Policy updates. Previewing and preparing a review do not write to GHL. The review shows the exact old status, proposed Active status, destination and history note. Sending requires a separate approval checkbox and button.

Only the existing Medicare policy-status field can change. Active is an assumption from supported positive commissions, not carrier-verified coverage. Newer/different policies, ambiguous applications and changed evidence stop the proposal. Other contact fields are omitted from the write request. Reference drafts are not sent.

The history note preserves the prior status before the field update. A service-only operation journal, five-minute leases and fresh access/evidence checks prevent overlapping sends. Uncertain note creation is reconciled by its operation marker; it is never blindly posted again. Uncertain field updates are read back before resuming. Revoked mappings or source assignments stop recovery.

GHL note creation and contact updates are separate API calls, not an atomic transaction. Snapshot checks and readback cannot prevent an outside edit at the exact same moment. There is no blanket rollback, bulk send or background write.

Required token scopes: locations.readonly, users.readonly, contacts.readonly, locations/customFields.readonly and contacts.write. Tokens and private contact data stay out of Git. Journal migration 0014 was tested in an isolated database and applied only to the backed-up local database. No hosted deployment or Main merge is included.

Validation includes simulated API failures/recovery and rollback-only synthetic SQL authorization/lease tests. A real single-contact write pilot remains pending explicit review and approval; no real GHL POST or PUT was used during development.