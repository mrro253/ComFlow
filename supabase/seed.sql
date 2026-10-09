-- Local development seed data.
-- Demo login credentials (password is the same for everyone):
--   Owner:    owner@commissionflow.dev    / password123
--   Manager:  manager@commissionflow.dev  / password123 (Mike - manages Alex, Priya)
--   Manager:  manager2@commissionflow.dev / password123 (Sara - manages Chris, Taylor)
--   Agent:    agent@commissionflow.dev    / password123 (Alex, reports to Mike)
--   Agent:    agent2@commissionflow.dev   / password123 (Priya, reports to Mike)
--   Agent:    agent3@commissionflow.dev   / password123 (Chris, reports to Sara)
--   Agent:    agent4@commissionflow.dev   / password123 (Taylor, reports to Sara)
--   Agent:    agent5@commissionflow.dev   / password123 (Jordan, unassigned)
--
-- Comp plans demoed: "Standard Plan" (agency default, everyone unless
-- reassigned) and "Senior Agent Plan" (Taylor only, higher rates). Both
-- have independent New Business vs Renewal rates - see OPP-1110 (Priya,
-- renewal) and OPP-1131 (Taylor, Senior Agent Plan). The Standard Plan
-- also has a "$500 at 3 enrollments/month" agent bonus that Alex has
-- already qualified for (see Settings -> Bonuses) but hasn't been
-- awarded yet - good for demoing the manual award flow.
--
-- NOTE: seeding auth.users directly via SQL is a local-dev-only trick -
-- it relies on Supabase's local GoTrue reading auth.users/auth.identities
-- the same way it would after a real signup. This is not something you'd
-- ever do against a hosted/production project.

-- ============================================================================
-- Auth users
-- ============================================================================

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, confirmation_token, email_change,
  email_change_token_new, recovery_token
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    '22222222-2222-2222-2222-222222222222',
    'authenticated', 'authenticated',
    'owner@commissionflow.dev',
    crypt('password123', gen_salt('bf')),
    now(), '{"provider":"email","providers":["email"]}', '{}',
    now(), now(), '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '33333333-3333-3333-3333-333333333333',
    'authenticated', 'authenticated',
    'manager@commissionflow.dev',
    crypt('password123', gen_salt('bf')),
    now(), '{"provider":"email","providers":["email"]}', '{}',
    now(), now(), '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '44444444-4444-4444-4444-444444444444',
    'authenticated', 'authenticated',
    'agent@commissionflow.dev',
    crypt('password123', gen_salt('bf')),
    now(), '{"provider":"email","providers":["email"]}', '{}',
    now(), now(), '', '', '', ''
  ),
  -- Second manager + four more agents so the Users hierarchy page and
  -- the Overview dashboard's "Top agents" ranking have realistic
  -- multi-person data to show instead of just one person per role.
  (
    '00000000-0000-0000-0000-000000000000',
    '66666666-6666-6666-6666-666666666666',
    'authenticated', 'authenticated',
    'manager2@commissionflow.dev',
    crypt('password123', gen_salt('bf')),
    now(), '{"provider":"email","providers":["email"]}', '{}',
    now(), now(), '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '77777777-7777-7777-7777-777777777777',
    'authenticated', 'authenticated',
    'agent2@commissionflow.dev',
    crypt('password123', gen_salt('bf')),
    now(), '{"provider":"email","providers":["email"]}', '{}',
    now(), now(), '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '88888888-8888-8888-8888-888888888888',
    'authenticated', 'authenticated',
    'agent3@commissionflow.dev',
    crypt('password123', gen_salt('bf')),
    now(), '{"provider":"email","providers":["email"]}', '{}',
    now(), now(), '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '99999999-9999-9999-9999-999999999999',
    'authenticated', 'authenticated',
    'agent4@commissionflow.dev',
    crypt('password123', gen_salt('bf')),
    now(), '{"provider":"email","providers":["email"]}', '{}',
    now(), now(), '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'authenticated', 'authenticated',
    'agent5@commissionflow.dev',
    crypt('password123', gen_salt('bf')),
    now(), '{"provider":"email","providers":["email"]}', '{}',
    now(), now(), '', '', '', ''
  )
on conflict (id) do nothing;

insert into auth.identities (
  id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at
)
values
  (
    gen_random_uuid(), '22222222-2222-2222-2222-222222222222',
    '22222222-2222-2222-2222-222222222222',
    '{"sub":"22222222-2222-2222-2222-222222222222","email":"owner@commissionflow.dev"}',
    'email', now(), now(), now()
  ),
  (
    gen_random_uuid(), '33333333-3333-3333-3333-333333333333',
    '33333333-3333-3333-3333-333333333333',
    '{"sub":"33333333-3333-3333-3333-333333333333","email":"manager@commissionflow.dev"}',
    'email', now(), now(), now()
  ),
  (
    gen_random_uuid(), '44444444-4444-4444-4444-444444444444',
    '44444444-4444-4444-4444-444444444444',
    '{"sub":"44444444-4444-4444-4444-444444444444","email":"agent@commissionflow.dev"}',
    'email', now(), now(), now()
  ),
  (
    gen_random_uuid(), '66666666-6666-6666-6666-666666666666',
    '66666666-6666-6666-6666-666666666666',
    '{"sub":"66666666-6666-6666-6666-666666666666","email":"manager2@commissionflow.dev"}',
    'email', now(), now(), now()
  ),
  (
    gen_random_uuid(), '77777777-7777-7777-7777-777777777777',
    '77777777-7777-7777-7777-777777777777',
    '{"sub":"77777777-7777-7777-7777-777777777777","email":"agent2@commissionflow.dev"}',
    'email', now(), now(), now()
  ),
  (
    gen_random_uuid(), '88888888-8888-8888-8888-888888888888',
    '88888888-8888-8888-8888-888888888888',
    '{"sub":"88888888-8888-8888-8888-888888888888","email":"agent3@commissionflow.dev"}',
    'email', now(), now(), now()
  ),
  (
    gen_random_uuid(), '99999999-9999-9999-9999-999999999999',
    '99999999-9999-9999-9999-999999999999',
    '{"sub":"99999999-9999-9999-9999-999999999999","email":"agent4@commissionflow.dev"}',
    'email', now(), now(), now()
  ),
  (
    gen_random_uuid(), 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","email":"agent5@commissionflow.dev"}',
    'email', now(), now(), now()
  )
on conflict (provider, provider_id) do nothing;

-- ============================================================================
-- Agency, profiles, commission plan
-- ============================================================================

insert into public.agencies (id, name, created_at)
values ('11111111-1111-1111-1111-111111111111', 'Sunrise Medicare Advisors', now())
on conflict (id) do nothing;

-- Two named plans: "Standard Plan" (the agency default, used by everyone
-- unless assigned otherwise) and "Senior Agent Plan" (higher rates,
-- assigned only to Taylor below) - demonstrates multiple comp plans per
-- agency plus independent New Business vs Renewal rates on each. Created
-- before `users` since Taylor's row below references the second plan.
insert into public.commission_plans (id, agency_id, name, active, is_default, created_at)
values
  (
    '55555555-5555-5555-5555-555555555555',
    '11111111-1111-1111-1111-111111111111',
    'Standard Plan', true, true, now()
  ),
  (
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    '11111111-1111-1111-1111-111111111111',
    'Senior Agent Plan', true, false, now()
  )
on conflict (id) do nothing;

insert into public.commission_plan_rates (
  agency_id, commission_plan_id, role, business_type, percent
)
values
  -- Standard Plan: MVP defaults on new business, lower renewal rates.
  ('11111111-1111-1111-1111-111111111111', '55555555-5555-5555-5555-555555555555', 'agent', 'new', 10),
  ('11111111-1111-1111-1111-111111111111', '55555555-5555-5555-5555-555555555555', 'agent', 'renewal', 6),
  ('11111111-1111-1111-1111-111111111111', '55555555-5555-5555-5555-555555555555', 'manager', 'new', 2),
  ('11111111-1111-1111-1111-111111111111', '55555555-5555-5555-5555-555555555555', 'manager', 'renewal', 1.5),
  ('11111111-1111-1111-1111-111111111111', '55555555-5555-5555-5555-555555555555', 'owner', 'new', 1),
  ('11111111-1111-1111-1111-111111111111', '55555555-5555-5555-5555-555555555555', 'owner', 'renewal', 1),
  -- Senior Agent Plan: higher agent/manager cut on both new and renewal.
  ('11111111-1111-1111-1111-111111111111', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'agent', 'new', 12),
  ('11111111-1111-1111-1111-111111111111', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'agent', 'renewal', 8),
  ('11111111-1111-1111-1111-111111111111', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'manager', 'new', 2.5),
  ('11111111-1111-1111-1111-111111111111', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'manager', 'renewal', 2),
  ('11111111-1111-1111-1111-111111111111', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'owner', 'new', 1),
  ('11111111-1111-1111-1111-111111111111', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'owner', 'renewal', 1)
on conflict (commission_plan_id, role, business_type) do nothing;

-- Basic bonus: agents on the Standard Plan earn a $500 bonus at 3
-- enrollments in a calendar month. Alex hits exactly 3 this month in the
-- seeded transactions below, so the "Bonuses" card in Settings shows a
-- ready-to-award row out of the box.
insert into public.commission_plan_bonuses (
  agency_id, commission_plan_id, role, threshold_count, bonus_amount
)
values (
  '11111111-1111-1111-1111-111111111111',
  '55555555-5555-5555-5555-555555555555',
  'agent', 3, 500
)
on conflict do nothing;

-- Taylor is assigned to the Senior Agent Plan explicitly; everyone else
-- falls back to the agency default (Standard Plan).
insert into public.users (
  id, agency_id, first_name, last_name, email, role, manager_id, commission_plan_id, created_at
)
values
  (
    '22222222-2222-2222-2222-222222222222',
    '11111111-1111-1111-1111-111111111111',
    'Jane', 'Owner', 'owner@commissionflow.dev', 'owner', null, null, now()
  ),
  (
    '33333333-3333-3333-3333-333333333333',
    '11111111-1111-1111-1111-111111111111',
    'Mike', 'Manager', 'manager@commissionflow.dev', 'manager', null, null, now()
  ),
  (
    '44444444-4444-4444-4444-444444444444',
    '11111111-1111-1111-1111-111111111111',
    'Alex', 'Agent', 'agent@commissionflow.dev', 'agent',
    '33333333-3333-3333-3333-333333333333', null, now()
  ),
  -- Second manager + their team, plus one unassigned agent - gives the
  -- Users hierarchy page and the dashboard's Top Agents ranking a
  -- realistic multi-person org chart instead of one person per role.
  (
    '66666666-6666-6666-6666-666666666666',
    '11111111-1111-1111-1111-111111111111',
    'Sara', 'Manager', 'manager2@commissionflow.dev', 'manager', null, null, now()
  ),
  (
    '77777777-7777-7777-7777-777777777777',
    '11111111-1111-1111-1111-111111111111',
    'Priya', 'Patel', 'agent2@commissionflow.dev', 'agent',
    '33333333-3333-3333-3333-333333333333', null, now()
  ),
  (
    '88888888-8888-8888-8888-888888888888',
    '11111111-1111-1111-1111-111111111111',
    'Chris', 'Nguyen', 'agent3@commissionflow.dev', 'agent',
    '66666666-6666-6666-6666-666666666666', null, now()
  ),
  (
    '99999999-9999-9999-9999-999999999999',
    '11111111-1111-1111-1111-111111111111',
    'Taylor', 'Brooks', 'agent4@commissionflow.dev', 'agent',
    '66666666-6666-6666-6666-666666666666',
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', now()
  ),
  (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    '11111111-1111-1111-1111-111111111111',
    'Jordan', 'Lee', 'agent5@commissionflow.dev', 'agent',
    null, null, now()
  )
on conflict (id) do nothing;

-- ============================================================================
-- Sample commission transactions: enrolled opportunities across 5 agents
-- and 2 managers, spread over the last ~5 months plus a few recent days, so
-- the Overview dashboard's charts and "Top agents" ranking have realistic
-- variation instead of a single agent/month. Each opportunity produces an
-- agent line + manager override line (skipped if the agent has no manager,
-- like Jordan) + owner override line. `business_type` defaults to 'new'
-- unless noted otherwise below.
-- ============================================================================

insert into public.commission_transactions (
  agency_id, user_id, opportunity_id, role, business_type, sale_amount, commission_amount, commission_plan_id, created_at
)
values
  -- Opportunity OPP-1001 - sale_amount 3200
  ('11111111-1111-1111-1111-111111111111', '44444444-4444-4444-4444-444444444444', 'OPP-1001', 'agent', 'new', 3200, 320, '55555555-5555-5555-5555-555555555555', now() - interval '4 months'),
  ('11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333333', 'OPP-1001', 'manager', 'new', 3200, 64, '55555555-5555-5555-5555-555555555555', now() - interval '4 months'),
  ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 'OPP-1001', 'owner', 'new', 3200, 32, '55555555-5555-5555-5555-555555555555', now() - interval '4 months'),

  -- Opportunity OPP-1014 - sale_amount 4800
  ('11111111-1111-1111-1111-111111111111', '44444444-4444-4444-4444-444444444444', 'OPP-1014', 'agent', 'new', 4800, 480, '55555555-5555-5555-5555-555555555555', now() - interval '3 months'),
  ('11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333333', 'OPP-1014', 'manager', 'new', 4800, 96, '55555555-5555-5555-5555-555555555555', now() - interval '3 months'),
  ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 'OPP-1014', 'owner', 'new', 4800, 48, '55555555-5555-5555-5555-555555555555', now() - interval '3 months'),

  -- Opportunity OPP-1027 - sale_amount 2650
  ('11111111-1111-1111-1111-111111111111', '44444444-4444-4444-4444-444444444444', 'OPP-1027', 'agent', 'new', 2650, 265, '55555555-5555-5555-5555-555555555555', now() - interval '2 months'),
  ('11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333333', 'OPP-1027', 'manager', 'new', 2650, 53, '55555555-5555-5555-5555-555555555555', now() - interval '2 months'),
  ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 'OPP-1027', 'owner', 'new', 2650, 26.5, '55555555-5555-5555-5555-555555555555', now() - interval '2 months'),

  -- Opportunity OPP-1041 - sale_amount 5400
  ('11111111-1111-1111-1111-111111111111', '44444444-4444-4444-4444-444444444444', 'OPP-1041', 'agent', 'new', 5400, 540, '55555555-5555-5555-5555-555555555555', now() - interval '1 months'),
  ('11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333333', 'OPP-1041', 'manager', 'new', 5400, 108, '55555555-5555-5555-5555-555555555555', now() - interval '1 months'),
  ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 'OPP-1041', 'owner', 'new', 5400, 54, '55555555-5555-5555-5555-555555555555', now() - interval '1 months'),

  -- Opportunity OPP-1058 - sale_amount 3900. Enrollment #1 this month for
  -- Alex, toward the Standard Plan's "3 enrollments -> $500" agent bonus.
  ('11111111-1111-1111-1111-111111111111', '44444444-4444-4444-4444-444444444444', 'OPP-1058', 'agent', 'new', 3900, 390, '55555555-5555-5555-5555-555555555555', now() - interval '6 days'),
  ('11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333333', 'OPP-1058', 'manager', 'new', 3900, 78, '55555555-5555-5555-5555-555555555555', now() - interval '6 days'),
  ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 'OPP-1058', 'owner', 'new', 3900, 39, '55555555-5555-5555-5555-555555555555', now() - interval '6 days'),

  -- Opportunity OPP-1059 - sale_amount 2800. Enrollment #2 this month for Alex.
  ('11111111-1111-1111-1111-111111111111', '44444444-4444-4444-4444-444444444444', 'OPP-1059', 'agent', 'new', 2800, 280, '55555555-5555-5555-5555-555555555555', now() - interval '4 days'),
  ('11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333333', 'OPP-1059', 'manager', 'new', 2800, 56, '55555555-5555-5555-5555-555555555555', now() - interval '4 days'),
  ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 'OPP-1059', 'owner', 'new', 2800, 28, '55555555-5555-5555-5555-555555555555', now() - interval '4 days'),

  -- Opportunity OPP-1060 - sale_amount 3100. Enrollment #3 this month for
  -- Alex - hits the bonus threshold, so Settings' "Bonuses" card shows a
  -- ready-to-award row for Alex out of the box.
  ('11111111-1111-1111-1111-111111111111', '44444444-4444-4444-4444-444444444444', 'OPP-1060', 'agent', 'new', 3100, 310, '55555555-5555-5555-5555-555555555555', now() - interval '2 days'),
  ('11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333333', 'OPP-1060', 'manager', 'new', 3100, 62, '55555555-5555-5555-5555-555555555555', now() - interval '2 days'),
  ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 'OPP-1060', 'owner', 'new', 3100, 31, '55555555-5555-5555-5555-555555555555', now() - interval '2 days'),

  -- Priya (reports to Mike) - OPP-1065, sale_amount 2900, 5 months ago
  ('11111111-1111-1111-1111-111111111111', '77777777-7777-7777-7777-777777777777', 'OPP-1065', 'agent', 'new', 2900, 290, '55555555-5555-5555-5555-555555555555', now() - interval '5 months'),
  ('11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333333', 'OPP-1065', 'manager', 'new', 2900, 58, '55555555-5555-5555-5555-555555555555', now() - interval '5 months'),
  ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 'OPP-1065', 'owner', 'new', 2900, 29, '55555555-5555-5555-5555-555555555555', now() - interval '5 months'),

  -- Chris (reports to Sara) - OPP-1078, sale_amount 5200, 4 months ago
  ('11111111-1111-1111-1111-111111111111', '88888888-8888-8888-8888-888888888888', 'OPP-1078', 'agent', 'new', 5200, 520, '55555555-5555-5555-5555-555555555555', now() - interval '4 months'),
  ('11111111-1111-1111-1111-111111111111', '66666666-6666-6666-6666-666666666666', 'OPP-1078', 'manager', 'new', 5200, 104, '55555555-5555-5555-5555-555555555555', now() - interval '4 months'),
  ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 'OPP-1078', 'owner', 'new', 5200, 52, '55555555-5555-5555-5555-555555555555', now() - interval '4 months'),

  -- Taylor (reports to Sara) - OPP-1093, sale_amount 3600, 3 months ago.
  -- Recorded under the Standard Plan, before Taylor was later moved to
  -- the Senior Agent Plan (see OPP-1131 below) - historical transactions
  -- always keep whatever plan was active when they were generated.
  ('11111111-1111-1111-1111-111111111111', '99999999-9999-9999-9999-999999999999', 'OPP-1093', 'agent', 'new', 3600, 360, '55555555-5555-5555-5555-555555555555', now() - interval '3 months'),
  ('11111111-1111-1111-1111-111111111111', '66666666-6666-6666-6666-666666666666', 'OPP-1093', 'manager', 'new', 3600, 72, '55555555-5555-5555-5555-555555555555', now() - interval '3 months'),
  ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 'OPP-1093', 'owner', 'new', 3600, 36, '55555555-5555-5555-5555-555555555555', now() - interval '3 months'),

  -- Priya - OPP-1072, sale_amount 4100, 2 months ago
  ('11111111-1111-1111-1111-111111111111', '77777777-7777-7777-7777-777777777777', 'OPP-1072', 'agent', 'new', 4100, 410, '55555555-5555-5555-5555-555555555555', now() - interval '2 months'),
  ('11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333333', 'OPP-1072', 'manager', 'new', 4100, 82, '55555555-5555-5555-5555-555555555555', now() - interval '2 months'),
  ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 'OPP-1072', 'owner', 'new', 4100, 41, '55555555-5555-5555-5555-555555555555', now() - interval '2 months'),

  -- Jordan (no manager assigned) - OPP-1105, sale_amount 2100, 2 months ago
  -- Only 2 lines: no manager override since Jordan has no manager yet.
  ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'OPP-1105', 'agent', 'new', 2100, 210, '55555555-5555-5555-5555-555555555555', now() - interval '2 months'),
  ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 'OPP-1105', 'owner', 'new', 2100, 21, '55555555-5555-5555-5555-555555555555', now() - interval '2 months'),

  -- Chris - OPP-1085, sale_amount 2400, 1 month ago
  ('11111111-1111-1111-1111-111111111111', '88888888-8888-8888-8888-888888888888', 'OPP-1085', 'agent', 'new', 2400, 240, '55555555-5555-5555-5555-555555555555', now() - interval '1 months'),
  ('11111111-1111-1111-1111-111111111111', '66666666-6666-6666-6666-666666666666', 'OPP-1085', 'manager', 'new', 2400, 48, '55555555-5555-5555-5555-555555555555', now() - interval '1 months'),
  ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 'OPP-1085', 'owner', 'new', 2400, 24, '55555555-5555-5555-5555-555555555555', now() - interval '1 months'),

  -- Taylor - OPP-1099, sale_amount 4700, 5 days ago (still Standard Plan)
  ('11111111-1111-1111-1111-111111111111', '99999999-9999-9999-9999-999999999999', 'OPP-1099', 'agent', 'new', 4700, 470, '55555555-5555-5555-5555-555555555555', now() - interval '5 days'),
  ('11111111-1111-1111-1111-111111111111', '66666666-6666-6666-6666-666666666666', 'OPP-1099', 'manager', 'new', 4700, 94, '55555555-5555-5555-5555-555555555555', now() - interval '5 days'),
  ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 'OPP-1099', 'owner', 'new', 4700, 47, '55555555-5555-5555-5555-555555555555', now() - interval '5 days'),

  -- Priya - OPP-1090, sale_amount 3300, 3 days ago
  ('11111111-1111-1111-1111-111111111111', '77777777-7777-7777-7777-777777777777', 'OPP-1090', 'agent', 'new', 3300, 330, '55555555-5555-5555-5555-555555555555', now() - interval '3 days'),
  ('11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333333', 'OPP-1090', 'manager', 'new', 3300, 66, '55555555-5555-5555-5555-555555555555', now() - interval '3 days'),
  ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 'OPP-1090', 'owner', 'new', 3300, 33, '55555555-5555-5555-5555-555555555555', now() - interval '3 days'),

  -- Priya - OPP-1110, sale_amount 2000, RENEWAL - pays the Standard Plan's
  -- lower renewal rates (6% / 1.5% / 1%) instead of the new-business rates,
  -- demonstrating the New Business vs Renewal split.
  ('11111111-1111-1111-1111-111111111111', '77777777-7777-7777-7777-777777777777', 'OPP-1110', 'agent', 'renewal', 2000, 120, '55555555-5555-5555-5555-555555555555', now() - interval '10 days'),
  ('11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333333', 'OPP-1110', 'manager', 'renewal', 2000, 30, '55555555-5555-5555-5555-555555555555', now() - interval '10 days'),
  ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 'OPP-1110', 'owner', 'renewal', 2000, 20, '55555555-5555-5555-5555-555555555555', now() - interval '10 days'),

  -- Taylor - OPP-1131, sale_amount 5000, new business, under the Senior
  -- Agent Plan (12% / 2.5% / 1%) after being moved onto it.
  ('11111111-1111-1111-1111-111111111111', '99999999-9999-9999-9999-999999999999', 'OPP-1131', 'agent', 'new', 5000, 600, 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', now() - interval '1 days'),
  ('11111111-1111-1111-1111-111111111111', '66666666-6666-6666-6666-666666666666', 'OPP-1131', 'manager', 'new', 5000, 125, 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', now() - interval '1 days'),
  ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 'OPP-1131', 'owner', 'new', 5000, 50, 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', now() - interval '1 days');

-- ============================================================================
-- Carrier-statement model (migration 0005)
-- ============================================================================
-- Demo producers for the statement-driven model. Names and rates are
-- synthetic except the MAPD schedule, which mirrors the confirmed TruePlan
-- Career rates (effective 2026-10-08). Managers are not producers.
--   Jane (owner)  - Independent Agency Owner (paid directly by the carrier)
--   Alex          - Career, Benefit Consultant
--   Priya         - Career, Senior Benefit Consultant
--   Chris         - Career, Client Advisor
--   Taylor        - Career, Private Client Advisor
--   Jordan        - Independent agent

update public.users set agent_type = 'independent'
  where id in (
    '22222222-2222-2222-2222-222222222222',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
  );

update public.users set agent_type = 'career', career_level = 'Benefit Consultant'
  where id = '44444444-4444-4444-4444-444444444444';
update public.users set agent_type = 'career', career_level = 'Senior Benefit Consultant'
  where id = '77777777-7777-7777-7777-777777777777';
update public.users set agent_type = 'career', career_level = 'Client Advisor'
  where id = '88888888-8888-8888-8888-888888888888';
update public.users set agent_type = 'career', career_level = 'Private Client Advisor'
  where id = '99999999-9999-9999-9999-999999999999';

-- MAPD fixed-dollar schedule, stored in integer cents.
insert into public.compensation_rules (
  agency_id, agent_type, career_level, product, commission_type,
  calculation_method, rate_cents, status, effective_from
)
select
  '11111111-1111-1111-1111-111111111111', 'career', level, 'MAPD', commission_type,
  'FIXED', rate_cents, 'ACTIVE', date '2026-10-08'
from (values
  ('Benefit Consultant',        'T65',         30000),
  ('Benefit Consultant',        'PLAN_CHANGE', 10000),
  ('Benefit Consultant',        'RENEWAL',       700),
  ('Senior Benefit Consultant', 'T65',         35000),
  ('Senior Benefit Consultant', 'PLAN_CHANGE', 12500),
  ('Senior Benefit Consultant', 'RENEWAL',      1000),
  ('Client Advisor',            'T65',         40000),
  ('Client Advisor',            'PLAN_CHANGE', 15000),
  ('Client Advisor',            'RENEWAL',      1250),
  ('Private Client Advisor',    'T65',         45000),
  ('Private Client Advisor',    'PLAN_CHANGE', 15000),
  ('Private Client Advisor',    'RENEWAL',      1500)
) as rates(level, commission_type, rate_cents);

-- Owner's personal production is reported separately from the agency's.
insert into public.production_entities (agency_id, name, entity_type, user_id)
values
  ('11111111-1111-1111-1111-111111111111', 'Demo Agency - Agency Production', 'agency', null),
  ('11111111-1111-1111-1111-111111111111', 'Jane Owner - Personal Production', 'personal',
   '22222222-2222-2222-2222-222222222222');

-- Statement writing-agent names resolve to users only via explicit aliases.
insert into public.writing_agent_aliases (agency_id, user_id, alias)
values
  ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 'JANE OWNER'),
  ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 'OWNER JANE'),
  ('11111111-1111-1111-1111-111111111111', '44444444-4444-4444-4444-444444444444', 'ALEX AGENT'),
  ('11111111-1111-1111-1111-111111111111', '44444444-4444-4444-4444-444444444444', 'AGENT ALEX');
