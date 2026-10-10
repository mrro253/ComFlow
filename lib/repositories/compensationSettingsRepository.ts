import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { NewRule, RuleChangePlan, RuleRow } from "@/lib/carriers/compensation/ruleSettings";
import type { Database, Json } from "@/types/database";
import type { CareerLevelRecord, LevelVisibility } from "@/types/domain";

/**
 * Database layer for the Owner-editable compensation settings: career levels and
 * compensation rules. Reads use the session client (RLS scopes them to the agency);
 * writes use the service-role client and every caller must have checked the Owner
 * role first (see the server actions).
 */

type LevelRow = Database["public"]["Tables"]["career_levels"]["Row"];
type RuleDbRow = Database["public"]["Tables"]["compensation_rules"]["Row"];

function mapLevel(row: LevelRow): CareerLevelRecord {
  return {
    id: row.id,
    agencyId: row.agency_id,
    name: row.name,
    rank: row.rank,
    visibility: row.visibility,
    active: row.active,
  };
}

function mapRule(row: RuleDbRow): RuleRow {
  return {
    id: row.id,
    careerLevel: row.career_level,
    product: row.product,
    commissionType: row.commission_type,
    calculationMethod: row.calculation_method,
    rateCents: row.rate_cents,
    ratePercent: row.rate_percent,
    percentBasis: row.percent_basis,
    status: row.status,
    effectiveFrom: row.effective_from,
    effectiveTo: row.effective_to,
  };
}

export async function listCareerLevels(agencyId: string): Promise<CareerLevelRecord[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("career_levels")
    .select("*")
    .eq("agency_id", agencyId)
    .order("rank", { ascending: true });
  if (error || !data) return [];
  return data.map(mapLevel);
}

export async function createCareerLevel(input: {
  agencyId: string;
  actorId: string;
  name: string;
  rank: number;
  visibility: LevelVisibility;
}): Promise<void> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("career_levels")
    .insert({ agency_id: input.agencyId, name: input.name, rank: input.rank, visibility: input.visibility })
    .select("id")
    .single();
  if (error || !data) {
    if (error?.code === "23505") throw new Error("You already have a level with that name.");
    throw new Error(error?.message ?? "Could not add the level");
  }
  await audit(input.agencyId, input.actorId, "career_level.created", data.id, {
    name: input.name,
    visibility: input.visibility,
  });
}

/** Visibility and active are the only editable fields; names never change. */
export async function updateCareerLevel(input: {
  agencyId: string;
  actorId: string;
  levelId: string;
  visibility?: LevelVisibility;
  active?: boolean;
}): Promise<void> {
  const admin = createAdminClient();
  const changes = {
    ...(input.visibility !== undefined && { visibility: input.visibility }),
    ...(input.active !== undefined && { active: input.active }),
  };
  const { data, error } = await admin
    .from("career_levels")
    .update(changes)
    .eq("id", input.levelId)
    .eq("agency_id", input.agencyId)
    .select("id")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Level not found.");
  await audit(input.agencyId, input.actorId, "career_level.updated", input.levelId, changes);
}

export async function listCompensationRules(agencyId: string): Promise<RuleRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("compensation_rules")
    .select("*")
    .eq("agency_id", agencyId)
    .eq("agent_type", "career")
    .order("effective_from", { ascending: false });
  if (error || !data) return [];
  return data.map(mapRule);
}

/**
 * Applies a validated rule change: closes the rules it replaces (effective_to only;
 * rates are never edited), then adds the new one.
 * TODO: do both steps in one database function so a crash between them cannot leave
 * the old rule open next to the new one.
 */
export async function applyRuleChange(input: {
  agencyId: string;
  actorId: string;
  plan: Extract<RuleChangePlan, { ok: true }>;
}): Promise<void> {
  const admin = createAdminClient();
  const rule: NewRule = input.plan.insert;

  const { data: created, error } = await admin
    .from("compensation_rules")
    .insert({
      agency_id: input.agencyId,
      agent_type: "career",
      career_level: rule.careerLevel,
      product: rule.product,
      commission_type: rule.commissionType,
      calculation_method: rule.calculationMethod,
      rate_cents: rule.rateCents,
      rate_percent: rule.ratePercent,
      percent_basis: rule.percentBasis,
      status: "ACTIVE",
      effective_from: rule.effectiveFrom,
    })
    .select("id")
    .single();
  if (error || !created) throw new Error(error?.message ?? "Could not save the rate");

  for (const close of input.plan.close) {
    const { error: closeError } = await admin
      .from("compensation_rules")
      .update({ effective_to: close.effectiveTo })
      .eq("id", close.id)
      .eq("agency_id", input.agencyId);
    if (closeError) throw new Error(closeError.message);
  }

  await audit(input.agencyId, input.actorId, "compensation_rule.created", created.id, {
    level: rule.careerLevel,
    product: rule.product,
    commission_type: rule.commissionType,
    method: rule.calculationMethod,
    rate_cents: rule.rateCents,
    rate_percent: rule.ratePercent,
    effective_from: rule.effectiveFrom,
    closed_rules: input.plan.close.map((c) => c.id),
  });
}

export async function setBonusesEnabled(input: {
  agencyId: string;
  actorId: string;
  enabled: boolean;
}): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin.from("agencies").update({ bonuses_enabled: input.enabled }).eq("id", input.agencyId);
  if (error) throw new Error(error.message);
  await audit(input.agencyId, input.actorId, "agency.bonuses_toggled", input.agencyId, { enabled: input.enabled });
}

async function audit(
  agencyId: string,
  actorId: string,
  action: string,
  entityId: string,
  details: Json
): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin.from("audit_events").insert({
    agency_id: agencyId,
    actor_user_id: actorId,
    action,
    entity_type: action.split(".")[0],
    entity_id: entityId,
    details,
  });
  if (error) throw new Error(error.message);
}
