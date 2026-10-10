"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/requireRole";
import { activeLevelNames, planNewLevel } from "@/lib/carriers/careerLevels";
import {
  parseDollarsToCents,
  parsePercent,
  planRuleChange,
} from "@/lib/carriers/compensation/ruleSettings";
import {
  applyRuleChange,
  createCareerLevel,
  listCareerLevels,
  listCompensationRules,
  setBonusesEnabled,
  updateCareerLevel,
} from "@/lib/repositories/compensationSettingsRepository";
import { LEVEL_VISIBILITIES, type LevelVisibility } from "@/types/domain";
import type { ActionResult } from "@/app/(auth)/actions";

/**
 * Owner-only server actions for the Compensation page (also used by onboarding).
 * Every action re-checks the role; the database is written with the service role.
 */

function revalidateAll() {
  revalidatePath("/compensation");
  revalidatePath("/onboarding");
  revalidatePath("/users");
  revalidatePath("/settings");
}

function parseVisibility(raw: FormDataEntryValue | null): LevelVisibility | null {
  const value = String(raw ?? "");
  return (LEVEL_VISIBILITIES as string[]).includes(value) ? (value as LevelVisibility) : null;
}

export async function addCareerLevel(
  _prev: ActionResult | undefined,
  formData: FormData
): Promise<ActionResult> {
  try {
    const owner = await requireRole(["owner"]);
    const visibility = parseVisibility(formData.get("visibility")) ?? "own";
    const plan = planNewLevel(await listCareerLevels(owner.agencyId), String(formData.get("name") ?? ""));
    if (!plan.ok) return { error: plan.error };

    await createCareerLevel({
      agencyId: owner.agencyId,
      actorId: owner.id,
      name: plan.name,
      rank: plan.rank,
      visibility,
    });
    revalidateAll();
    return { info: `Added ${plan.name}.` };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not add the level." };
  }
}

export async function changeLevelVisibility(
  _prev: ActionResult | undefined,
  formData: FormData
): Promise<ActionResult> {
  try {
    const owner = await requireRole(["owner"]);
    const visibility = parseVisibility(formData.get("visibility"));
    if (!visibility) return { error: "Choose what this level can see." };
    await updateCareerLevel({
      agencyId: owner.agencyId,
      actorId: owner.id,
      levelId: String(formData.get("levelId") ?? ""),
      visibility,
    });
    revalidateAll();
    return { info: "Saved." };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not save." };
  }
}

export async function setLevelActive(
  _prev: ActionResult | undefined,
  formData: FormData
): Promise<ActionResult> {
  try {
    const owner = await requireRole(["owner"]);
    await updateCareerLevel({
      agencyId: owner.agencyId,
      actorId: owner.id,
      levelId: String(formData.get("levelId") ?? ""),
      active: formData.get("active") === "true",
    });
    revalidateAll();
    return { info: "Saved." };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not save." };
  }
}

/** Adds a rate effective from a date; the previous open rate for the same key ends the day before. */
export async function saveCompensationRule(
  _prev: ActionResult | undefined,
  formData: FormData
): Promise<ActionResult> {
  try {
    const owner = await requireRole(["owner"]);
    const method = String(formData.get("method") ?? "") === "PERCENT" ? "PERCENT" : "FIXED";
    const amount = String(formData.get("amount") ?? "");

    const [levels, existing] = await Promise.all([
      listCareerLevels(owner.agencyId),
      listCompensationRules(owner.agencyId),
    ]);

    const plan = planRuleChange(
      existing,
      {
        careerLevel: String(formData.get("careerLevel") ?? ""),
        product: String(formData.get("product") ?? ""),
        commissionType: String(formData.get("commissionType") ?? ""),
        method,
        rateCents: method === "FIXED" ? parseDollarsToCents(amount) : null,
        ratePercent: method === "PERCENT" ? parsePercent(amount) : null,
        effectiveFrom: String(formData.get("effectiveFrom") ?? ""),
      },
      activeLevelNames(levels)
    );
    if (!plan.ok) return { error: plan.error };

    await applyRuleChange({ agencyId: owner.agencyId, actorId: owner.id, plan });
    revalidateAll();
    return { info: "Rate saved. Earlier business keeps the rate it was written under." };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not save the rate." };
  }
}

export async function changeBonusesEnabled(
  _prev: ActionResult | undefined,
  formData: FormData
): Promise<ActionResult> {
  try {
    const owner = await requireRole(["owner"]);
    await setBonusesEnabled({
      agencyId: owner.agencyId,
      actorId: owner.id,
      enabled: formData.get("enabled") === "true",
    });
    revalidateAll();
    return { info: "Saved." };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not save." };
  }
}
