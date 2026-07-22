# Commission Engine

Pure business logic for calculating Medicare/Medicaid agency commissions.
This folder has **no dependency on the database, CRM, or UI** - every
function here takes plain data in and returns plain data out. That's what
lets it be unit tested with zero setup and reused from server actions,
route handlers, or a future background job without changes.

## Business rule

A commission is generated when a CRM opportunity reaches the **`Enrolled`**
stage (see `ENROLLED_STAGE` in `types.ts`). One enrolled opportunity can
produce up to three commission lines:

| Role    | MVP default (new business) | Example on a $1,000 sale |
| ------- | --------------------------- | ------------------------- |
| Agent   | 10%                          | $100                       |
| Manager | 2% (override, only if the agent has a manager) | $20 |
| Owner   | 1% (override, on every sale)                   | $10 |

Percentages are **never hardcoded** - they're read from a `CommissionPlan`
and its per-role, per-business-type rates (`commission_plans` +
`commission_plan_rates` tables, loaded via
`lib/repositories/commissionPlanRepository.ts`) and passed in as a
`CommissionPlanConfig`. The 10/2/1 numbers above are just the seeded
defaults for a new agency's first plan.

### Which plan governs a sale?

Agencies can have **multiple named plans** (e.g. "Standard Plan", "Senior
Agent Plan"). Each user (`users.commission_plan_id`) can be assigned a
specific plan; if unassigned, the agency's default plan applies
(`commission_plans.is_default`). Whichever plan the **selling agent** is
on governs *all three* roles' rates for that sale - the agent's cut, the
manager override, and the owner override all come from the same plan, so
there's never ambiguity about "whose plan wins." See
`resolvePlanConfigForAgent` in `commissionPlanRepository.ts`.

### New business vs. renewal

Each plan holds an independent rate per role **and** per
`businessType` (`"new"` | `"renewal"`) - e.g. an agent might earn 10% on
new business but only 5% on renewals. `NormalizedOpportunity.businessType`
carries this through from the CRM adapter (see
`lib/crm/gohighlevel/provider.ts`), and `calculateCommissionHierarchy`
picks the matching rate for each role automatically.

### Bonuses

A plan can also define flat-dollar bonuses per role, keyed to a monthly
enrollment count (`commission_plan_bonuses`, e.g. "Agents earn $500 at 10
enrollments/month"). Bonuses are **not** computed inside this engine's
per-opportunity flow - they're evaluated on demand from Settings
(`lib/reporting/bonusProgress.ts` + `evaluateBonusProgress.ts`) and
awarded manually by an Owner, which inserts a one-off `role: "bonus"`
commission transaction. `commission_bonus_awards` guarantees the same
bonus can never be paid twice for the same person in the same month.

## Files

| File | Purpose |
| ---- | ------- |
| `types.ts` | Shared types: `NormalizedOpportunity`, `CommissionPlanConfig`, `RatePair`, `CommissionLineResult`, `CommissionCalculationInput`, and the `ENROLLED_STAGE` constant. |
| `roundCurrency.ts` | Single source of truth for rounding to cents. |
| `calculateAgentCommission.ts` | `calculateAgentCommission(saleAmount, agentPercent)` - agent's cut. |
| `calculateManagerCommission.ts` | `calculateManagerCommission(saleAmount, managerPercent)` - manager's override. |
| `calculateOwnerCommission.ts` | `calculateOwnerCommission(saleAmount, ownerPercent)` - owner's override. |
| `calculateCommissionHierarchy.ts` | `calculateCommissionHierarchy(input)` - composes the three functions above into the full set of lines for one opportunity, selecting each role's new-vs-renewal rate from `input.plan`. |
| `evaluateBonusProgress.ts` | `evaluateBonusProgress(enrollmentCount, thresholdCount)` - pure threshold check backing the Settings "Bonuses" progress/award UI. |
| `processEnrolledOpportunity.ts` | The only function that touches the database. Use-case entrypoint called by CRM adapters/webhooks: loads the agent, their manager, the agency owner, and the agent's resolved plan, runs `calculateCommissionHierarchy`, and persists the resulting `commission_transactions` rows. |
| `__fixtures__/sampleTransactions.ts` | Reusable sample agents/opportunities/plans for tests (mirrors `supabase/seed.sql`). |
| `__tests__/` | Unit tests (Vitest) for every function above. |

## Why three small functions instead of one big one?

Each role's math is trivial (`saleAmount * percent / 100`), but keeping
them separate means:

- Each is independently testable and named for exactly what it does.
- `calculateCommissionHierarchy` reads as a plain-English description of
  the business rule (agent always paid; manager paid only if one exists;
  owner paid unless they'd be double-counted) instead of a wall of math.
- Future per-role changes (e.g. a manager gets a different formula than a
  flat percentage) touch one function without risking the others.

## Edge cases already handled

- **No manager assigned** (`manager: null`): the manager line is skipped
  entirely rather than generating a $0 row.
- **Owner is also the selling agent** (solo-owner agency): the owner
  override is skipped so the owner isn't paid twice for their own sale.
- **Owner is also the agent's direct manager**: same dedup logic - only
  one override line is produced, not a manager line *and* an owner line
  for the same person.
- **Renewal vs. new business**: each role's rate is looked up for
  `opportunity.businessType` independently, so a renewal-heavy agent on a
  plan with a lower renewal rate is paid correctly without special-casing
  anywhere outside `calculateCommissionHierarchy`.

See `calculateCommissionHierarchy.test.ts` for these scenarios as
executable specs.

## Running the tests

```bash
npm run test        # run once
npm run test:watch  # watch mode
```

## How to add a future commission structure

Multiple named plans, new-vs-renewal rates, and monthly bonuses are
already supported (see above). Beyond that, here's where each kind of
change belongs:

### 1. A different percentage per plan, or per agent (already supported)

Nothing to build - create another row in `commission_plans` (Settings ->
"New plan"), edit its rate grid, and assign it to specific agents/managers
from the Users page. `resolvePlanConfigForAgent` always resolves the
right plan per sale, so no code changes are needed for this case.

### 2. Tiered/volume-based percentages (e.g. 10% up to $5k, 12% above)

Change the *inputs* to `calculateAgentCommission` (and friends), not their
signature's meaning. E.g. add an optional `tiers` array to
`CommissionPlanConfig` and have `calculateAgentCommission` pick the right
rate for `saleAmount` before doing the multiplication. Keep the function
pure and covered by tests for each tier boundary.

### 3. A new role/tier (e.g. a "Regional Director" override above Owner)

1. Add the role to `CommissionRole` in `types/domain.ts` and the `check`
   constraint on `commission_transactions.role` in a new migration.
2. Add a `calculate<Role>Commission.ts` file following the existing
   pattern (pure function, `(saleAmount, percent) => number`).
3. Add rows for the new role to `commission_plan_rates` (new migration
   updates the `role` check constraint) and to `CommissionPlanConfig["rates"]`.
4. Wire it into `calculateCommissionHierarchy` next to the existing
   manager/owner logic, including any new double-counting guards.
5. `processEnrolledOpportunity.ts` needs no changes beyond loading
   whatever new person record the new role requires (same pattern as
   `getAgencyOwner`).

### 4. Per-product or per-carrier commission rates

Add the relevant field (e.g. `productType`) to `NormalizedOpportunity` in
`types.ts` (populated by the CRM adapter), then extend
`commission_plan_rates` with a `product_type` column (mirroring how
`business_type` was added) and thread it through `buildRateConfig` in
`commissionPlanRepository.ts`. Do **not** put product-specific logic in
`processEnrolledOpportunity.ts` - it should stay a thin orchestrator.

### 5. Automatic (rather than manual) bonus payouts

`awardCommissionPlanBonus` is intentionally Owner-triggered, not a cron
job - there's no background scheduler in the MVP. To automate it, add a
scheduled Vercel Cron route that calls `buildBonusProgressRows` for every
agency once a month and awards every qualified, not-yet-awarded row the
same way the Settings action does.

### General rule

Anything that changes *how much* someone is paid belongs in one of the
`calculate*Commission.ts` files or a new one like them. Anything that
changes *who* gets paid belongs in `calculateCommissionHierarchy.ts`.
Anything that changes *where the data comes from* (repositories, CRM
adapters) should never leak into this folder - that boundary is what
keeps the engine trivially testable.
