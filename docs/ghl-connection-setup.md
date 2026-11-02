# GoHighLevel connection setup — November 2, 2026

Branch: `feature/ghl-connection-setup`. Local preview: `http://localhost:3011/settings/ghl`. No Main merge or hosted deployment.

## Personal and shared locations

- Every active user has a personal location connection form. Personal configuration is private to that user, including from other agency users. The token is never shown again.
- Agency owners can configure one shared location for the agency. They map active ComFlow teammates to GHL user IDs after a read-only API check verifies each user's membership in that exact location. A GHL user can map to only one ComFlow teammate per shared connection.
- Mapped agents can see the shared location's metadata and their own mapping, but cannot obtain, replace or disconnect its token. Unmapped agents see a request to contact their owner.
- Replacing the shared location/token creates a new connection and deletes the old credentials/mappings atomically. The screen warns the owner to map agents again. An invalid replacement leaves the old connection intact.
- Personal and shared setup may coexist. Neither currently grants contact access. Connection selection, contact ownership enforcement, matching and updates must be implemented/tested separately before those operations are enabled. A mapping alone is not authorization to read arbitrary contacts.

## How to enter access

1. In the intended GHL sub-account/location, an authorized administrator creates a Private Integration named ComFlow.
2. Grant `locations.readonly`. Add `users.readonly` if using shared-agent mapping. Contact read/write permissions are not needed for this phase.
3. Paste the Location ID and Private Integration Token directly into the appropriate masked ComFlow form. Do not send the token in chat, GitHub, screenshots or source control.
4. Save and test performs a read-only location check, validates the returned ID/name, encrypts the token server-side and saves configuration atomically. Replacing or disconnecting access is available on the same page.
5. The shared owner selects an active teammate and enters their GHL user ID. The server checks the GHL user's ID and explicit location membership before saving that mapping. Ambiguous/missing membership is denied.

Official references checked November 2, 2026:

- [Private Integration setup and administrator permissions](https://help.gohighlevel.com/support/solutions/articles/155000003054-private-integrations-everything-you-need-to-know)
- [Private Integration authorization and Version header example](https://marketplace.gohighlevel.com/docs/Authorization/PrivateIntegrationsToken/)
- [Get location metadata](https://marketplace.gohighlevel.com/docs/ghl/locations/get-location/)
- [Get user metadata, including roles.locationIds](https://marketplace.gohighlevel.com/docs/ghl/users/get-user/)
- [Required scopes](https://marketplace.gohighlevel.com/docs/Authorization/Scopes/index.html)

The setup client uses the documented `https://services.leadconnectorhq.com` origin and `Version: 2021-07-28` authorization example. Actual live token compatibility has not been verified: no real token was supplied during implementation. API errors are generic and do not echo upstream bodies, headers, URLs or credentials. Requests have a timeout, reject redirects and do not cache responses.

## Storage and access boundaries

Migration `0013_ghl_connections.sql` adds connection metadata, encrypted credentials, agent mappings and a service-only atomic setup RPC. It has no contact or commission mutation. Ordinary browser roles have no privilege to read credential ciphertext or execute the setup RPC. Metadata/mapping reads enforce agency, active-profile, owner and individual-user boundaries through RLS. The server requires an active signed-in user and rechecks ownership before any privileged secret read; the RPC independently rechecks actor/agency/role inside its transaction.

Encryption uses the existing server-only `CREDENTIAL_ENCRYPTION_KEY`, AES-256-GCM with random IVs and GHL-specific additional authenticated data bound to connection, agency, user and location. No plaintext token goes into the database, localStorage, URLs, response state, logs or Git. Forms clear their token field after a server response. Setup audit entries contain actor/action/connection metadata, never token contents. Preserve the existing encryption key securely; losing it requires token replacement.

## Verification and local rollout

- 608 unit/regression tests pass. New cases cover cryptographic binding/tampering, fixed read-only API destinations, denied redirects, mismatched locations/users, response-error redaction, owner-only shared actions, active-team selection and authentication.
- Real synthetic database tests cover personal/shared visibility, owner privacy boundaries, mapped/unmapped users, cross-agency and inactive denial, forbidden browser secret/RPC access, mapping uniqueness, atomic failed replacement and credential deletion on disconnect. Fixtures and audit rows roll back.
- Authenticated synthetic owner/mapped-agent/unmapped-agent SSR checks verify the correct token forms/location visibility and absence of credential strings from rendered/serialized HTML. Those fixtures were removed; no GHL API was called.
- Application type checks, ESLint and production build pass. The signed-in owner browser preview shows both setup options with empty masked password fields and the permission guide.
- A full private local database backup was saved outside Git/OneDrive before migration 0013. Existing statement, carrier-entry, commission-entry, user and audit fingerprints match afterward. The migration is recorded only in the local working database; it has not been deployed to a hosted project.

## Not enabled

No GHL contact fetching, contact matching, ownership inference, policy/status changes, historical notes, scheduled CRM jobs or contact creation. Current/past policy-field rules in the earlier GHL plan remain applicable to the next phase. Carrier retrieval stays manual through Sync now. Tokens must be entered by users through the setup page before live metadata verification can be assessed; do not represent synthetic verification as a successful real GHL connection.
