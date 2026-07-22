import { createClient, type TypedSupabaseClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";
import type {
  CommissionBonusAward,
  CommissionPlan,
  CommissionPlanBonus,
  CommissionPlanRate,
  CommissionPlanWithDetails,
} from "@/types/domain";
import type { CommissionPlanConfig, RatePair } from "@/lib/commission-engine/types";

type PlanRow = Database["public"]["Tables"]["commission_plans"]["Row"];
type RateRow = Database["public"]["Tables"]["commission_plan_rates"]["Row"];
type BonusRow = Database["public"]["Tables"]["commission_plan_bonuses"]["Row"];
type AwardRow = Database["public"]["Tables"]["commission_bonus_awards"]["Row"];

/** The subset of `CommissionRole` that a plan's rates/bonuses can be keyed by (excludes "bonus" itself). */
type PayableRole = "agent" | "manager" | "owner";

const PLAN_ROLES: PayableRole[] = ["agent", "manager", "owner"];
const BUSINESS_TYPES: Array<"new" | "renewal"> = ["new", "renewal"];

function mapPlanRow(row: PlanRow): CommissionPlan {
  return {
    id: row.id,
    agencyId: row.agency_id,
    name: row.name,
    active: row.active,
    isDefault: row.is_default,
    createdAt: row.created_at,
  };
}

function mapRateRow(row: RateRow): CommissionPlanRate {
  return {
    id: row.id,
    agencyId: row.agency_id,
    commissionPlanId: row.commission_plan_id,
    role: row.role,
    businessType: row.business_type,
    percent: Number(row.percent),
    createdAt: row.created_at,
  };
}

function mapBonusRow(row: BonusRow): CommissionPlanBonus {
  return {
    id: row.id,
    agencyId: row.agency_id,
    commissionPlanId: row.commission_plan_id,
    role: row.role,
    thresholdCount: row.threshold_count,
    bonusAmount: Number(row.bonus_amount),
    createdAt: row.created_at,
  };
}

function mapAwardRow(row: AwardRow): CommissionBonusAward {
  return {
    id: row.id,
    agencyId: row.agency_id,
    commissionPlanBonusId: row.commission_plan_bonus_id,
    userId: row.user_id,
    period: row.period,
    commissionTransactionId: row.commission_transaction_id,
    awardedAt: row.awarded_at,
  };
}

export async function listPlansForAgency(
  agencyId: string
): Promise<CommissionPlan[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("commission_plans")
    .select("*")
    .eq("agency_id", agencyId)
    .order("created_at", { ascending: true });

  if (error || !data) return [];
  return data.map(mapPlanRow);
}

export async function listRatesForPlans(
  planIds: string[]
): Promise<CommissionPlanRate[]> {
  if (planIds.length === 0) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("commission_plan_rates")
    .select("*")
    .in("commission_plan_id", planIds);

  if (error || !data) return [];
  return data.map(mapRateRow);
}

export async function listBonusesForPlans(
  planIds: string[]
): Promise<CommissionPlanBonus[]> {
  if (planIds.length === 0) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("commission_plan_bonuses")
    .select("*")
    .in("commission_plan_id", planIds)
    .order("threshold_count", { ascending: true });

  if (error || !data) return [];
  return data.map(mapBonusRow);
}

/** All plans for an agency, bundled with their rates and bonuses. */
export async function listPlansWithDetails(
  agencyId: string
): Promise<CommissionPlanWithDetails[]> {
  const plans = await listPlansForAgency(agencyId);
  const planIds = plans.map((p) => p.id);
  const [rates, bonuses] = await Promise.all([
    listRatesForPlans(planIds),
    listBonusesForPlans(planIds),
  ]);

  return plans.map((plan) => ({
    ...plan,
    rates: rates.filter((r) => r.commissionPlanId === plan.id),
    bonuses: bonuses.filter((b) => b.commissionPlanId === plan.id),
  }));
}

/** Returns the agency's default plan (used for any user with no explicit assignment). */
export async function getDefaultPlanForAgency(
  agencyId: string,
  client?: TypedSupabaseClient
): Promise<CommissionPlan | null> {
  const supabase = client ?? (await createClient());
  const { data, error } = await supabase
    .from("commission_plans")
    .select("*")
    .eq("agency_id", agencyId)
    .eq("is_default", true)
    .maybeSingle();

  if (error || !data) return null;
  return mapPlanRow(data);
}

/**
 * Resolves the plan that should govern a given agent's sale: their
 * explicit assignment if set, otherwise the agency's default plan.
 * Returns the flattened `CommissionPlanConfig` shape the pure calculators
 * index into directly (`plan.rates.agent[businessType]`).
 */
export async function resolvePlanConfigForAgent(
  agencyId: string,
  agentCommissionPlanId: string | null,
  client?: TypedSupabaseClient
): Promise<CommissionPlanConfig | null> {
  const supabase = client ?? (await createClient());

  const plan = agentCommissionPlanId
    ? await getPlanById(agentCommissionPlanId, supabase)
    : await getDefaultPlanForAgency(agencyId, supabase);

  if (!plan) return null;

  const { data, error } = await supabase
    .from("commission_plan_rates")
    .select("*")
    .eq("commission_plan_id", plan.id);

  if (error || !data) return null;

  return {
    id: plan.id,
    name: plan.name,
    rates: buildRateConfig(data.map(mapRateRow)),
  };
}

function buildRateConfig(rates: CommissionPlanRate[]): CommissionPlanConfig["rates"] {
  const emptyPair = (): RatePair => ({ new: 0, renewal: 0 });
  const config: CommissionPlanConfig["rates"] = {
    agent: emptyPair(),
    manager: emptyPair(),
    owner: emptyPair(),
  };

  for (const rate of rates) {
    if (rate.role === "bonus") continue;
    config[rate.role as PayableRole][rate.businessType] = rate.percent;
  }
  return config;
}

async function getPlanById(
  planId: string,
  supabase: TypedSupabaseClient
): Promise<CommissionPlan | null> {
  const { data, error } = await supabase
    .from("commission_plans")
    .select("*")
    .eq("id", planId)
    .maybeSingle();

  if (error || !data) return null;
  return mapPlanRow(data);
}

/**
 * Creates a new named plan with every role x business-type rate seeded at
 * 0% so the UI always has a full grid to edit - no missing-row handling
 * needed downstream. If this is the agency's first plan, it's made the
 * default automatically.
 */
export async function createPlan(
  agencyId: string,
  name: string
): Promise<CommissionPlanWithDetails> {
  const supabase = await createClient();
  const existing = await listPlansForAgency(agencyId);
  const isFirstPlan = existing.length === 0;

  const { data: planRow, error: planError } = await supabase
    .from("commission_plans")
    .insert({ agency_id: agencyId, name, active: true, is_default: isFirstPlan })
    .select("*")
    .single();

  if (planError || !planRow) {
    throw new Error(planError?.message ?? "Failed to create commission plan");
  }

  const rateRows = PLAN_ROLES.flatMap((role) =>
    BUSINESS_TYPES.map((businessType) => ({
      agency_id: agencyId,
      commission_plan_id: planRow.id,
      role,
      business_type: businessType,
      percent: 0,
    }))
  );

  const { data: rates, error: ratesError } = await supabase
    .from("commission_plan_rates")
    .insert(rateRows)
    .select("*");

  if (ratesError || !rates) {
    throw new Error(ratesError?.message ?? "Failed to create plan rates");
  }

  return { ...mapPlanRow(planRow), rates: rates.map(mapRateRow), bonuses: [] };
}

/**
 * Called once at signup to give a brand-new agency a usable starting plan,
 * seeded with the MVP-documented defaults (10% agent / 2% manager / 1%
 * owner, same for new business and renewals) instead of the 0% grid
 * `createPlan` normally seeds. Owners can rename/adjust it from Settings.
 */
export async function createDefaultPlanForNewAgency(
  agencyId: string
): Promise<CommissionPlanWithDetails> {
  const plan = await createPlan(agencyId, "Standard Plan");
  const rates = await updatePlanRates(plan.id, agencyId, [
    { role: "agent", businessType: "new", percent: 10 },
    { role: "agent", businessType: "renewal", percent: 10 },
    { role: "manager", businessType: "new", percent: 2 },
    { role: "manager", businessType: "renewal", percent: 2 },
    { role: "owner", businessType: "new", percent: 1 },
    { role: "owner", businessType: "renewal", percent: 1 },
  ]);
  return { ...plan, rates };
}

/** Upserts every role x business-type rate for a plan in one call. */
export async function updatePlanRates(
  planId: string,
  agencyId: string,
  rates: { role: PayableRole; businessType: "new" | "renewal"; percent: number }[]
): Promise<CommissionPlanRate[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("commission_plan_rates")
    .upsert(
      rates.map((r) => ({
        agency_id: agencyId,
        commission_plan_id: planId,
        role: r.role,
        business_type: r.businessType,
        percent: r.percent,
      })),
      { onConflict: "commission_plan_id,role,business_type" }
    )
    .select("*");

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to update plan rates");
  }
  return data.map(mapRateRow);
}

export async function renamePlan(planId: string, name: string): Promise<CommissionPlan> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("commission_plans")
    .update({ name })
    .eq("id", planId)
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to rename plan");
  }
  return mapPlanRow(data);
}

export async function setPlanActive(planId: string, active: boolean): Promise<CommissionPlan> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("commission_plans")
    .update({ active })
    .eq("id", planId)
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to update plan status");
  }
  return mapPlanRow(data);
}

/** Makes `planId` the agency's default, unsetting any previous default first
 *  (avoids ever having two default plans at once, which the DB forbids). */
export async function setDefaultPlan(agencyId: string, planId: string): Promise<void> {
  const supabase = await createClient();

  const { error: clearError } = await supabase
    .from("commission_plans")
    .update({ is_default: false })
    .eq("agency_id", agencyId);

  if (clearError) {
    throw new Error(clearError.message);
  }

  const { error: setError } = await supabase
    .from("commission_plans")
    .update({ is_default: true })
    .eq("id", planId);

  if (setError) {
    throw new Error(setError.message);
  }
}

export async function createBonus(
  agencyId: string,
  planId: string,
  input: { role: PayableRole; thresholdCount: number; bonusAmount: number }
): Promise<CommissionPlanBonus> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("commission_plan_bonuses")
    .insert({
      agency_id: agencyId,
      commission_plan_id: planId,
      role: input.role,
      threshold_count: input.thresholdCount,
      bonus_amount: input.bonusAmount,
    })
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to create bonus rule");
  }
  return mapBonusRow(data);
}

export async function deleteBonus(bonusId: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("commission_plan_bonuses")
    .delete()
    .eq("id", bonusId);

  if (error) {
    throw new Error(error.message);
  }
}

export async function getBonusById(bonusId: string): Promise<CommissionPlanBonus | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("commission_plan_bonuses")
    .select("*")
    .eq("id", bonusId)
    .maybeSingle();

  if (error || !data) return null;
  return mapBonusRow(data);
}

export async function listAwardsForAgency(
  agencyId: string
): Promise<CommissionBonusAward[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("commission_bonus_awards")
    .select("*")
    .eq("agency_id", agencyId);

  if (error || !data) return [];
  return data.map(mapAwardRow);
}

export async function hasBonusBeenAwarded(
  bonusId: string,
  userId: string,
  period: string
): Promise<boolean> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("commission_bonus_awards")
    .select("id")
    .eq("commission_plan_bonus_id", bonusId)
    .eq("user_id", userId)
    .eq("period", period)
    .maybeSingle();

  if (error) return false;
  return Boolean(data);
}

export async function recordBonusAward(input: {
  agencyId: string;
  bonusId: string;
  userId: string;
  period: string;
  commissionTransactionId: string;
}): Promise<CommissionBonusAward> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("commission_bonus_awards")
    .insert({
      agency_id: input.agencyId,
      commission_plan_bonus_id: input.bonusId,
      user_id: input.userId,
      period: input.period,
      commission_transaction_id: input.commissionTransactionId,
    })
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to record bonus award");
  }
  return mapAwardRow(data);
}
