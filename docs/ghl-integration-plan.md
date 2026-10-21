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
