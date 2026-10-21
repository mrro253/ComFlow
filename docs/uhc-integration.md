# UnitedHealthcare integration status

Development branch only. No UHC parser, database import or scheduled sync is registered.

From worker/, run `npm run uhc:download -- --year 2026 --resume --output <absolute-private-directory>`; alternatively use `--month YYYY-MM` without `--resume`.

Sign in interactively in the separate worker browser and open Commissions → Statements and More. No credentials or browser storage are saved to disk. Sources must remain outside the checkout. PDF/text files and manifests are content-addressed; matching-account cached sources are verified before reuse. Resume does not establish whether the portal has revised an earlier statement.

Recoverable failures pause and retain the browser context. Enter `retry` in the worker terminal to reload downloader code and retry in that same session, or `quit` to close. Successful completion closes the browser. Carrier session expiration can still require authentication. Browser closure cannot be recovered without another sign-in.

Live status: eight private pairs exist for January–July and September 2026. August and October remain outstanding. The live worker rejected the account header; the check now permits a separate writing ID while requiring exactly one explicit payee ID. That correction and the retained-session retry interaction are not live-verified. No claim of successful automated UHC collection or financial reconciliation is made.

Validation: worker TypeScript and 273 synthetic tests pass. Tests cover source integrity, period/account matching, ambiguous headers, unavailable months, cache isolation and partial failures. They do not prove portal compatibility. No client data or credentials belong in fixtures, logs or Git.
