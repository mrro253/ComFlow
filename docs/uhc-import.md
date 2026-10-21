# UnitedHealthcare statement import

## Scope

The first UHC parser supports the verified two-page rotated PDF layout: one writing agent, positive Renewal entries, zero premium/UAD activity, and a zero-balance payment summary. Other categories, comp types, additional pages/writers, reissues, balance activity and inconsistent totals are rejected for review. No new dependency, schema, migration, compensation rule or RLS policy is introduced.

Upload the saved PDF on Statements, selecting UnitedHealthcare. The existing owner/independent-owner permissions, server-rebuilt preview, duplicate checks and atomic import apply. No Jarvis access is needed. Automatic downloads remain a separate development branch and are not enabled by this change.

## Mapping and integrity

- The printed Policy Number supplies the existing carrier-specific transaction identifier. Medicare/AARP/exchange identifiers remain source detail fields; they are not substituted for policy identity.
- Original Effective Date supplies the effective date. Statement Date supplies the accounting month. Today's Date and application dates do not.
- Agent Writing supplies verified writing-agent proof. The carrier-specific writer number is displayed as source detail but is not used to match the existing global payee-ID field. Names require an existing exact match or a deliberately saved alias; ambiguous/unmatched names remain subject to the existing review flow.
- Renewal maps to RENEWAL because the carrier prints that category. No category is inferred from an amount. Product is displayed as printed; no carrier-wide Medicare product assumption is made.
- Entry sums must equal the printed detail subtotal, summary Commission Activity and Payment Amount. All supported balances and UAD/premium figures must be zero. Monetary arithmetic uses integer cents.
- PDF hashes are verified before parsing and enrichment. Entry identity incorporates source hash, policy/effective date/category/amount and within-source occurrence. Existing economic duplicate/correction protection remains unchanged.
- Client names and source fields are reconstructed only for transaction IDs visible to the signed-in user. Detail enrichment verifies exact source hash, transaction key, identifier, effective date, amount and category before returning a row.

## Verification

Eight private PDF/text pairs for January–July and September 2026 were hash-verified and independently compared. All 46 entries match on policy number, effective date, writer, client name and amount; PDF detail totals and summaries reconcile to 133,032 cents. No source files, identifiers or client names are included in Git or fixtures. Text exports remain private cross-check sources; this phase persists the PDF through the existing storage flow.

282 synthetic tests, application TypeScript and ESLint pass. Production build passes. Synthetic PDF extraction, unsupported layouts, totals/balances, writing proof, occurrences/replay and RLS-visible detail enrichment are covered. Local authenticated upload/preview/import was verified for January and February, including exact Ryan attribution. The remaining six saved PDFs were imported through the existing repository storage and atomic RPC after the same pure parser, assignment and duplicate checks. All eight statements are imported: 46 entries / 133,032 cents, all assigned to Ryan. Activity filtering, client names, 18 source-detail fields and statement month coverage were verified in the local app. A repeat dry run proposes zero new entries. Ultimate remains 94 entries / 1,110,416 cents; agent earnings remain empty. No portal access was used.

August and October are not among the saved sources. November/December were not available in the observed portal list. Do not label missing months as unpaid or assume the portal is complete.
