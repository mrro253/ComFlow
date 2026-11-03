# Link statement clients and create missing GHL contacts

The original-statement page offers one setup action that saves verified statement/contact links and creates missing contacts in the connected GHL sub-account, assigned to the mapped GHL user. A SunFire application is not required. Source rows are reparsed and verified against current imported evidence; superseded or differently credited rows are excluded. This first version is run by the credited owner.

Before creation, a complete server-side location directory is read with bounded pagination, duplicate-page detection and count checks. Possible existing contacts are checked across assignments to avoid creating a duplicate under another agent. Other agents' contact details are never returned. Exact name/full-MBI matches or Ultimate name/partial-MBI/date matches can link; ambiguous identities, aliases, missing source identifiers and other-user assignments stay held. Missing plan names, email addresses and phone numbers are not invented.

New contacts contain the source name, mapped assignment and a ComFlow operation marker in the source field. A verified full MBI is included only when the original statement supplies one. Partial MBIs are never entered into the full Medicare-number field. Policy/status updates remain separate reviewed actions. A created contact with only a partial source MBI remains linked by its private creation provenance; later full-MBI policy comparison may still require more data.

Migration 0016 adds service-only operation and link tables. Database guards require the current active credited owner, active imported statement and current GHL mapping, protect immutable identities, enforce monotonic creation phases, and make links append only. One operation per connection/identity plus leases prevents concurrent creation by ComFlow. The create_pending phase is saved before POST. If its response is lost, the next run searches for the exact operation marker and never blindly posts another contact. Contacts and links are read back before reporting success. GHL does not supply an atomic name/MBI uniqueness transaction; a simultaneous outside creation between checks and POST remains possible.

No Main merge or scheduled carrier collection is included. Private names, identifiers and source files stay out of Git. The original statement and financial rows are unchanged. Existing shared-location mappings remain intact.

API contracts: [Create Contact](https://marketplace.gohighlevel.com/docs/2021-07-28/ghl/contacts/create-contact/) and [Get Contacts](https://marketplace.gohighlevel.com/docs/2021-07-28/ghl/contacts/get-contacts/). The existing versioned GET endpoint is deprecated upstream but currently supports the complete-directory pagination used here; incomplete or unsupported results stop creation.

## Held-match review

The Review held matches action reads original statement evidence and detailed GHL contacts without linking, creating or editing anything. It shows name agreement, full/partial MBI agreement, policy dates and carrier-member-ID agreement, without displaying identifiers or another agent's contact details.

Under Ryan's full-MBI rule, a unique full-MBI match assigned to the mapped agent can link despite middle initials or name formatting. Partial-MBI matches still require the same normalized full name and effective date. Another agent's duplicate does not prevent linking a unique verified contact belonging to the mapped agent; two contacts with the same MBI assigned to that agent stay held. Missing dates, differing partial identifiers and conflicting names are not silently accepted. The live detailed contact is checked again immediately before saving a link.

A prior saved SunFire/contact link can corroborate a partial statement ID when the original statement's normalized name, carrier and effective date all agree with the authorized enrollment source and its full MBI still agrees with the mapped GHL contact. Multiple conflicting saved targets cannot override a hold. The Link verified held matches action saves only existing verified contact links; it does not create contacts or change GHL policy fields.
