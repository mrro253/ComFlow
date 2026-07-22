/**
 * One-off local verification script (not part of the app) for the Comp
 * Plans v2 migration/seed data. Signs in as the seeded Owner against the
 * local Supabase instance (started via `supabase start`) and checks that
 * plans, rates, bonuses, and the new business_type/plan-assignment
 * columns came through as expected. Safe to commit: only uses the local
 * anon key that `supabase status` always prints (not a secret) and the
 * seeded demo password, never reads `.env.local`.
 *
 * Usage: node scripts/verify-comp-plans.js
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports -- plain Node script, not bundled
const { createClient } = require("@supabase/supabase-js");

const LOCAL_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";

async function main() {
  const supabase = createClient("http://127.0.0.1:54321", LOCAL_ANON_KEY);

  const { error: authError } = await supabase.auth.signInWithPassword({
    email: "owner@commissionflow.dev",
    password: "password123",
  });
  if (authError) throw new Error(`Login failed: ${authError.message}`);
  console.log("Signed in as owner.");

  const { data: plans, error: plansError } = await supabase
    .from("commission_plans")
    .select("id, name, active, is_default");
  if (plansError) throw plansError;
  console.log(`\nPlans (${plans.length}):`);
  for (const p of plans) console.log(`  - ${p.name} (active=${p.active}, default=${p.is_default})`);

  const { data: rates, error: ratesError } = await supabase
    .from("commission_plan_rates")
    .select("commission_plan_id, role, business_type, percent");
  if (ratesError) throw ratesError;
  console.log(`\nRates (${rates.length} rows, expect 12 = 2 plans x 3 roles x 2 business types):`);
  for (const r of rates) {
    console.log(`  - plan=${r.commission_plan_id.slice(0, 8)} ${r.role}/${r.business_type} = ${r.percent}%`);
  }

  const { data: bonuses, error: bonusesError } = await supabase
    .from("commission_plan_bonuses")
    .select("commission_plan_id, role, threshold_count, bonus_amount");
  if (bonusesError) throw bonusesError;
  console.log(`\nBonuses (${bonuses.length}):`);
  for (const b of bonuses) {
    console.log(`  - ${b.role}: ${b.threshold_count} enrollments/month -> $${b.bonus_amount}`);
  }

  const { data: users, error: usersError } = await supabase
    .from("users")
    .select("first_name, last_name, role, commission_plan_id");
  if (usersError) throw usersError;
  console.log(`\nUsers (${users.length}), with explicit plan assignment:`);
  for (const u of users) {
    if (u.commission_plan_id) {
      console.log(`  - ${u.first_name} ${u.last_name} (${u.role}) -> plan ${u.commission_plan_id.slice(0, 8)}`);
    }
  }

  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  const { data: alex } = await supabase
    .from("users")
    .select("id")
    .eq("email", "agent@commissionflow.dev")
    .single();
  const { count: alexEnrollments, error: countError } = await supabase
    .from("commission_transactions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", alex.id)
    .eq("role", "agent")
    .gte("created_at", monthStart);
  if (countError) throw countError;
  console.log(`\nAlex's enrollments this month: ${alexEnrollments} (expect 3, qualifies for the agent bonus)`);

  const { data: renewalTxn, error: renewalError } = await supabase
    .from("commission_transactions")
    .select("opportunity_id, business_type, commission_amount")
    .eq("opportunity_id", "OPP-1110")
    .eq("role", "agent")
    .single();
  if (renewalError) throw renewalError;
  console.log(
    `\nOPP-1110 (Priya, renewal): business_type=${renewalTxn.business_type}, agent commission=$${renewalTxn.commission_amount} (expect renewal/$120)`
  );

  const { data: seniorTxn, error: seniorError } = await supabase
    .from("commission_transactions")
    .select("opportunity_id, commission_plan_id, commission_amount")
    .eq("opportunity_id", "OPP-1131")
    .eq("role", "agent")
    .single();
  if (seniorError) throw seniorError;
  console.log(
    `OPP-1131 (Taylor, Senior Agent Plan): commission=$${seniorTxn.commission_amount} (expect $600 = 12% of $5000)`
  );

  console.log("\nAll checks completed.");
}

main().catch((err) => {
  console.error("Verification failed:", err.message);
  process.exit(1);
});
