# CommissionFlow

Commission tracking for Medicare and Medicaid insurance agencies. Syncs sales
data from a CRM and automatically calculates agent/manager/owner commissions
when an opportunity is marked **Enrolled**.

This repo is the MVP foundation: auth, role-based dashboard/settings shells,
a database schema with Row Level Security, a commission calculation engine,
and a CRM integration scaffold (GoHighLevel).

## Tech stack

- **Frontend:** Next.js 15 (App Router), TypeScript, Tailwind CSS, shadcn/ui-style components, Recharts
- **Backend:** Next.js Route Handlers + Server Actions
- **Database:** Supabase Postgres, managed with plain SQL migrations (no ORM)
- **Auth:** Supabase Auth (email/password)
- **Hosting target:** Vercel + a hosted Supabase project

## Prerequisites

- Node.js 20+
- [Supabase CLI](https://supabase.com/docs/guides/cli) (`brew install supabase/tap/supabase` or see docs)
- Docker Desktop (the Supabase CLI runs Postgres/Auth locally via Docker)

## Local development

1. **Install dependencies**

   ```bash
   npm install
   ```

2. **Start the local Supabase stack** (Postgres, Auth, Studio - all run in Docker)

   ```bash
   npx supabase start
   ```

   This applies everything in `supabase/migrations/` automatically. The
   first run downloads Docker images and may take a few minutes.

3. **Seed demo data**

   ```bash
   npx supabase db reset
   ```

   `db reset` re-applies migrations and then runs `supabase/seed.sql`,
   which creates a demo agency with two managers and five agents so the
   dashboard's charts, rankings, and hierarchy views have realistic data.
   It also seeds two comp plans ("Standard Plan", the agency default, and
   "Senior Agent Plan", assigned to one agent) with different New
   Business/Renewal rates, plus a monthly enrollment bonus one agent has
   already qualified for - see the comment at the top of `seed.sql` for
   exactly which demo scenarios are set up and where to find them in the
   UI:

   | Role    | Email                         | Password      | Reports to |
   | ------- | ------------------------------ | -------------- | ---------- |
   | Owner   | `owner@commissionflow.dev`     | `password123`  | -          |
   | Manager | `manager@commissionflow.dev`   | `password123`  | -          |
   | Manager | `manager2@commissionflow.dev`  | `password123`  | -          |
   | Agent   | `agent@commissionflow.dev`     | `password123`  | manager    |
   | Agent   | `agent2@commissionflow.dev`    | `password123`  | manager    |
   | Agent   | `agent3@commissionflow.dev`    | `password123`  | manager2   |
   | Agent   | `agent4@commissionflow.dev`    | `password123`  | manager2   |
   | Agent   | `agent5@commissionflow.dev`    | `password123`  | unassigned |

4. **Set environment variables**

   ```bash
   cp .env.local.example .env.local
   npx supabase status
   ```

   Copy the `API URL` -> `NEXT_PUBLIC_SUPABASE_URL`, `anon key` ->
   `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `service_role key` ->
   `SUPABASE_SERVICE_ROLE_KEY` from the `supabase status` output into
   `.env.local`.

5. **Run the app**

   ```bash
   npm run dev
   ```

   Visit [http://localhost:3000](http://localhost:3000) and sign in with
   one of the demo accounts above, or use "Create one" to spin up a fresh
   agency.

Supabase Studio (a local Postgres admin UI) runs at
[http://127.0.0.1:54323](http://127.0.0.1:54323) while `supabase start` is
running.

## Publishing / going live

The local-CLI workflow is designed to make this transition low-friction:

1. Create a project at [supabase.com](https://supabase.com).
2. `npx supabase link --project-ref <your-project-ref>`
3. `npx supabase db push` to apply `supabase/migrations/` to the hosted project.
4. Update `.env.local` (or your Vercel project's environment variables) with
   the hosted project's URL/keys instead of the local ones.
5. Deploy to Vercel (`vercel --prod`, or connect the repo in the Vercel dashboard).

Skip `supabase/seed.sql` in production - it's for local demo data only.

## Project structure

```
/app
  /(auth)/login, /(auth)/signup                 Auth pages + server actions
  /(dashboard)/dashboard                        Overview: KPIs, monthly charts, top agents, recent transactions
  /(dashboard)/commissions                      Full scoped commission transaction list
  /(dashboard)/users                            Owner/Manager-only org hierarchy view
  /(dashboard)/settings                         Commission plans/rates/bonuses, CRM connection, team management
  /api/webhooks/crm/[provider]                  CRM -> commission engine entrypoint
/components
  /ui                                            Shared design-system primitives
  /dashboard, /settings, /users                  Feature-specific UI
/lib
  /supabase                                      Client/server/admin Supabase clients + middleware
  /auth                                          Session + role-guard helpers
  /repositories                                  All database access (thin wrappers over supabase-js)
  /reporting                                     Pure aggregation (metrics.ts) + scoped data loading for dashboard pages
  /commission-engine                             Pure calculation + orchestration - no DB/CRM imports in the calculator
  /crm                                           CRM abstraction (ICRMProvider) + GoHighLevel adapter
/types                                           Hand-written schema + domain types
/supabase
  /migrations                         SQL schema + RLS policies
  seed.sql                            Local dev demo data
```

## Architecture notes

- **Multi-tenancy** is enforced at the database layer: every table carries
  an `agency_id`, and Row Level Security policies (see
  `supabase/migrations/0001_init.sql`) restrict every query to the caller's
  own agency and role - Owners see everything, Managers see their team,
  Agents see only themselves.
- **Commission plans are configurable, multiple-per-agency, and rate-flexible.**
  An agency can have several named plans (`commission_plans`), each with
  independent New Business vs. Renewal rates per role
  (`commission_plan_rates`) and optional monthly-enrollment bonuses
  (`commission_plan_bonuses`). Each user can be assigned a specific plan
  (`users.commission_plan_id`); unassigned users fall back to the agency's
  default plan. Rates are read at calculation time - never hardcoded in
  `lib/commission-engine`. See `lib/commission-engine/README.md` for the
  full breakdown and how to extend it further.
- **CRM integrations are pluggable.** `lib/crm/types.ts` defines
  `ICRMProvider`; `lib/crm/gohighlevel/provider.ts` is the only
  implementation for MVP. Adding HubSpot/Salesforce/Zoho/Pipedrive later
  means writing a new adapter and registering it in `lib/crm/index.ts` -
  no changes to business logic.

## Known TODOs (intentionally deferred for MVP speed)

- GoHighLevel OAuth + real API calls (`lib/crm/gohighlevel/provider.ts`) - currently stubbed.
- GoHighLevel doesn't have a first-class "New Business vs. Renewal" concept - the adapter
  expects a custom field mapped to `businessType` and defaults to `"new"` otherwise; confirm
  the real mapping once a live GHL account is connected.
- Webhook signature verification + idempotency (`app/api/webhooks/crm/[provider]/route.ts`).
- Bonus payouts are Owner-triggered from Settings, not automatic - there's no background
  scheduler in the MVP (see `lib/commission-engine/README.md` for how to add one).
- Plan assignment is a simple per-user field, not the full flexible LOA/GA/MGA hierarchy
  assignment some agencies use - out of scope until the broader hierarchy model is revisited.
- Teammates are added with an auto-generated temporary password instead of an email invite (`lib/repositories/userRepository.ts`).
- CRM access/refresh tokens are stored as plaintext - encrypt at rest before connecting real accounts.
- `types/database.ts` is hand-written; regenerate with `supabase gen types typescript --linked` once linked to a real project.
