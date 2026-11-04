# Enrollment tracking, GHL coverage and page clarity

Review branch: feature/ghl-contact-preview. Checked November 3, 2026. No new statements or carriers were collected. No imported, assignment, enrollment-outcome or GHL records were changed; no contact was created or linked. Provider comparisons used read-only GET flows. Existing automatic-import jobs were not replayed.

## Existing-record findings

- 19 collected applications: 8 Paid, 7 Not paid yet, 3 Charged back, 1 No commission expected.
- Of the seven Not paid yet applications, six lack imported statements for their carrier and one has unverified candidate evidence. Missing statements are not proof of a missing carrier payment.
- 16 saved enrollment/contact links remain separate from commission status. No saved enrollment-link recheck/unavailable state was reported in this walkthrough.
- 53 statement-policy groups credited to the current owner: 41 saved statement/contact links, 12 without a saved link. These are policy counts, not distinct clients or bank deposits. Zero saved update operations were paused.
- A read-only held-contact comparison retained all 12 holds. Five returned an assigned name/partial-MBI candidate without a policy date; two had other incomplete identity evidence; five had no eligible assigned candidate returned by that bounded review. This does not establish absence from the whole GHL location and does not justify duplicate creation or reassignment.
- The current policy preview read 16 linked applications / 80 field comparisons: 27 already agreed (including three already Active), 30 kept existing values, 19 lacked current-coverage confirmation, one was protected because multiple applications share a contact, and three proposed Active. Zero plan-detail proposals were offered. The three Active proposals were not prepared or sent.
- Saved update receipts describe previous completed operations, not a live guarantee that current GHL fields or assignments still agree. The live comparison is deliberately a separate optional tool.

No client names, full/partial MBIs, member IDs, source files, credentials or private screenshots belong in this review document or GitHub.

## Changes

### Enrollments: was this application paid?

The existing four payment labels remain unchanged. Added a derived waiting-reason breakdown: no carrier statements, unverified match, or no matching reported commission. It is recomputed from existing evidence, not persisted. No commission expected remains an explicit application-specific decision; a new application stays separate. If verified statement activity exists alongside that decision, the original decision is retained and the activity is made visible rather than silently overwriting either one.

Payment status is prominent. Saved GHL links, evidence and optional outcome corrections live inside expandable details. No routine disposition, review or approval is required. Dashboard graphs remain unchanged. Chargeback explanations now use chargeback wording consistently.

### GHL coverage: what is already connected?

/settings/ghl/coverage lists policy groups from original statements, even without a SunFire application. Shows saved links, stale-source links, prior verified updates and paused operations, with search/filter controls. It loads only the active user's credited source rows and scopes journals by agency, actor, connection and mapped GHL user. Source identifiers and provider credentials do not reach the page model.

The page does not decrypt a GHL token or make provider requests. It contains no write action. No saved link is not labeled No Contact Found: those are different facts. Existing GHL setup, original-statement comparison and update tools remain available behind an optional-tools disclosure. New-import processing is not backfilled.

### Page responsibilities

| Page | Main question |
| --- | --- |
| Dashboard | What are my commission totals and trends? Graphs remain in place. |
| Enrollments | Was each application paid, not paid yet, charged back or marked no commission expected? |
| GHL coverage | Which statement policies already have a saved GHL link or update receipt? |
| GHL sync results | What did automatic processing do after a new import? |
| GHL setup | Is my connection configured and automatic processing enabled? |
| Optional comparison/correction tools | What specific identity or policy evidence needs closer examination before a separate change? |

## Verification

712 tests passed, including new waiting-reason/outcome-conflict and read-only coverage/agent-scope tests. The app type check and final preview build passed. Existing-record browser walkthrough verified the totals above, saved-only coverage, existing read-only held-match and policy previews, filtering and collapsed correction controls. Protected statement/entry/user/audit fingerprints and saved link/operation counts are checked before and after the walkthrough. No database migration is required.

Remaining work is explicit: 12 identities remain unlinked; three Active proposals remain unsent; hosted execution/carrier verification and additional carrier coverage remain separate work. Nothing in this review approves an uncertain identity match or a new GHL write.
