# GHL integration: agreed behavior and implementation review

Updated 2026-10-21. Planning only: no GHL connection, API credentials, field creation or contact updates have been implemented or tested.

## Purpose and boundaries

ComFlow sends approved carrier-derived information to GHL. Reading GHL contacts and field definitions is for matching and mapping only; GHL never determines commission amounts or payable earnings. Existing carrier-receipt, owner-approval, integer-cent and locked-rate rules remain unchanged.

Ryan supplied screenshots of the TruePlan location, his GHL user and the existing custom fields. The user screenshot identifies a GHL **user**, not a contact. Location/user IDs are tenant configuration to verify and store per agency during setup, not hard-coded source constants. No screenshots, live contact data or credentials are included here.

## Decisions confirmed with Ryan

- Contact policy fields hold verified **current** information. Previous information belongs in GHL contact notes.
- Before an approved current-field change, preserve the prior values, source and relevant policy dates in notes. Include statement month and synchronization timestamp for traceability.
- Older statements must not replace newer verified policy information. Statement month alone does not prove that a policy is current.
- Keep policy coverage status separate from commission activity. A renewal, chargeback or missing commission does not independently establish present coverage status.
- Do not change existing policy status without explicit carrier coverage evidence or manual verification. Unsupported evidence leaves the existing status untouched.
- Start with one synthetic contact and synthetic statement data. Real-client writes require a separately reviewed preview and authorization.

## Existing Medicare field mapping from screenshots

Keys below are UI field keys, not asserted API field IDs. Resolve and verify any required IDs through authorized field-definition access during setup. Never invent truncated keys.

| GHL field | Screenshot key | Proposed handling |
| --- | --- | --- |
| First name | `contact.first_name` | Matching aid; do not automatically overwrite |
| Last name | `contact.last_name` | Matching aid; do not automatically overwrite |
| Medicare Policy Member ID | `contact.member_id` | Verified current carrier policy/member ID; not MBI |
| Medicare Policy Name | `contact.1_policy_name` | Update only when explicitly supplied and proven current; Ultimate rows currently do not establish a plan name |
| Medicare Policy Effective Date | Truncated in screenshot; confirm exact key | Map verified policy effective date; do not substitute statement/payment date |
| Medicare Policy Type | `contact.policy_type` | Ultimate MAPD maps to existing choice `Medicare Advantage` |
| Medicare Policy Status | `contact.1_policy_status` | Preserve unless explicit coverage evidence or manual verification supports change |
| Medicare Number (MBI) | `contact.medicare_number_mbi` | Separate identifier; do not put the carrier member ID here; masked/partial MBI is not an exact matching key |

Existing Policy Type choices: **Medicare Advantage**, **Medicare Supplement**, **Prescription Drug Plan**.

Existing Policy Status choices: **Active**, **Inactive**, **Future Active**, **Unknown**. Use these existing choices; do not silently introduce Pending, Cancelled or Terminated. Marshall and Ryan must approve any translation from a carrier's explicit status into these choices before enabling status writes.

The screenshots also show Contact, General Info, Additional Info, ACA, Indemnity, Dental Vision Hearing and Life Insurance folders. Their presence does not authorize synchronizing every field. Other products need separate carrier evidence and approved mappings; truncated keys and unshown dropdown options remain unconfirmed. No SSN synchronization is proposed.

## Proposed matching and history safeguards for Marshall's review

- Scope every connection and operation to the configured agency/location and authorized user. A GHL user mapping is separate from a GHL contact mapping; do not infer that a writing agent owns a contact or automatically reassign GHL ownership.
- Prefer an established contact-policy link or an unambiguous exact carrier member ID with verified carrier/product context. Confirm where carrier identity is stored in GHL; the screenshots do not identify a dedicated carrier field.
- Names assist review but do not establish a match alone. Duplicate, conflicting, missing or partial identifiers require human review; no guessed contact creation or overwrite.
- One contact can have multiple policies and history. A single set of product fields is only a current snapshot, not a policy ledger. Conflicting concurrent Medicare policies require review; do not collapse them into one just because the contact matches.
- Preview old/new values, evidence and proposed notes before writes. Missing source information does not clear an existing field. Record which policy and dates a proposed change refers to.
- Prevent duplicate notes on retries or reprocessing the same statement. If history preservation fails, do not proceed with the field update. If a field update fails after a history note succeeds, retain a recoverable operation state and avoid repeating the note. GHL note/field writes must not be assumed atomic.
- Commission history remains authoritative in ComFlow. Destination fields/notes and meaning for commission amounts, categories and periods are **not yet agreed**. Do not create a single ambiguous "paid" field or derive coverage status from commission categories.

These are proposed implementation safeguards, not an implemented synchronization service or new financial rules.

## Marshall's decisions before implementation

1. Choose and review the connection method (OAuth or a private integration), permissions, token protection, expiry/revocation handling and per-agency configuration. No API secret is needed for this planning document.
2. Verify the intended location/user mapping, exact field definitions and dropdown values, and select a synthetic contact. Credentials go through secure setup, never chat, Git, issues or screenshots.
3. Approve contact-policy linking, manual-review behavior, current-policy precedence, status translations, history note format and any proposed commission destinations.
4. Review the design within UI -> server actions -> services -> repositories, with pure mapping/matching logic tested separately. Any new library, schema, security access or financial/audit meaning changes follow README section 13 approval rules. This document does not authorize them.
5. Decide which explicit carrier evidence may support each GHL field. Current Ultimate commission statements do not establish every current policy attribute or coverage status.

## Delivery and acceptance plan

1. Field discovery and proposed mappings, with no contact writes.
2. Read-only matching preview using synthetic contacts: exact match, no match, duplicate match, wrong-location exclusion and multiple-policy conflicts.
3. Synthetic write tests after implementation approval: approved field changes and history notes; no status changes from renewal/chargeback/missing commission alone; old-statement protection; blank-value preservation; idempotent retries and partial-failure recovery.
4. Separately authorized real-contact preview and controlled pilot. No automatic live writes or background GHL synchronization enabled by this plan.

Not yet built or verified: API access, connection setup, ID resolution, contact matching, note writes, policy updates, retries, GHL commission fields and synchronization scheduling.


## Expanded field inventory for setup review

Transcribed from Ryan's supplied screenshots, not from API discovery. Keys are labels for later verification, not usable API IDs. These fields remain outside the first Medicare pilot unless explicitly approved. No existing GHL field needs to be renamed for this plan.

| Folder | Visible keys | Handling proposed for review |
| --- | --- | --- |
| Contact | `contact.middle_initial`, `contact.nick_name`, `contact.email`, `contact.phone`, `contact.date_of_birth`, `contact.gender`, `contact.source`, `contact.type`, `contact.poa_name` | Matching/display only when needed and authorized; no automatic demographic or ownership changes. One of the 12 screenshot fields is outside the visible area and remains unknown. |
| General Info | `contact.address1`, `contact.city`, `contact.state`, `contact.postal_code`, `contact.county`, `contact.timezone`, `contact.country`, `contact.company_name`, `contact.website` | Existing CRM information; no proposed writes from commission statements. |
| ACA | `contact.aca_member_id`, `contact.aca_policy_name`, `contact.aca_policy_type`, `contact.aca_policy_status` | Candidate current-policy snapshot only after carrier evidence and product mapping approval. Effective-date key is truncated; discover it during setup. Screenshot status type is multi-select; do not reuse Medicare single-select handling. |
| Indemnity | `contact.indemnity_member_id`, `contact.2_policy_name`, `contact.2_policy_type`, `contact.2_policy_status` | Candidate current-policy snapshot. Effective-date key is truncated. Dropdown choices remain unknown. |
| Dental Vision Hearing | `contact.dvh_member_id`, `contact.dvh_policy_name`, `contact.dvh_policy_type`, `contact.dvh_policy_status` | Candidate snapshot for the verified policy/bundle, not proof of three separate policies. Effective-date key is truncated. Type/status are free text in the screenshot. Concurrent policies need review. |
| Life Insurance | `contact.life_member_id`, `contact.3_policy_name`, `contact.3_policy_type`, `contact.3_policy_status`, `contact.smoker_status` | Candidate policy snapshot only; smoker status has no proposed commission-driven write. Effective-date key is truncated; dropdown choices remain unknown. |
| Additional Info | `contact.ss`, `contact.medicaid_`, `contact.medicaid_status`, `contact.vet_status` | No synchronization proposed. Power of Attorney key is truncated and excluded from mapping until verified. |

Medicare Part A/Part B effective-date keys are also truncated. Those entitlement dates are distinct from a policy effective date and are not derivable from commission dates. No annuity or separate final-expense field set was supplied; do not create or invent one automatically.

## Setup worksheet and pilot contract

| Item | Current state | Needed before implementation/pilot |
| --- | --- | --- |
| Agency/location | Screenshot reference supplied privately | Verify destination with Ryan; store configuration per agency without committing IDs. |
| Ryan's GHL user | User reference supplied privately | Map as an agent/user only; never use it as a contact ID. |
| Connection | Not selected | Marshall chooses method and least required access; secure token setup follows approval. |
| Field definitions | Screenshot inventory above | Read authorized location definitions and verify exact IDs, full keys, types and allowed values. Record missing/changed fields as blockers. |
| Carrier identity | No dedicated field shown | Approve where carrier/product context lives before exact member-ID matching. |
| Current policy | User preference confirmed | Approve explicit evidence and precedence rules; a recent payment is insufficient. |
| Synthetic contact | Not selected/created | Select one after connection approval; do not reuse a real client's record. |
| Commission destinations | Not agreed | Keep commission amount/category output disabled until destination and meaning are agreed. |

Proposed history note (synthetic example only; format subject to review):

> ComFlow policy update review: Medicare policy snapshot. Previous member ID: SYNTH-OLD; proposed member ID: SYNTH-NEW. Previous effective date: 2026-01-01; proposed effective date: 2027-01-01. Coverage status: unchanged. Evidence: synthetic carrier confirmation, verified 2026-10-21. Statement reference: synthetic-example; statement month: 2026-09. Update time: recorded at execution. Operation reference: stable retry identifier.

Preview must show matched contact, policy/carrier context, field-by-field old/new values, evidence date, source reference, history note and blockers. It must allow leaving a field unchanged. Avoid duplicating unrelated sensitive values in notes; the example is not approval to copy full client records or identifiers into logs.

Synthetic acceptance scenarios: exact established policy link; ambiguous member ID across carriers; duplicate contacts; partial MBI; newer verified policy versus older statement; simultaneous policies; unknown status; blank source values; wrong location; note failure; field-update failure after a successful note; retry without duplicate history. Status remains unchanged for renewal, chargeback and absent commission alone.

This inventory finishes the planning available from the supplied screenshots. API discovery, unresolved key verification and real connection testing remain pending Marshall's implementation review and authorized access.
