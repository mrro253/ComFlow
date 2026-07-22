"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/requireRole";
import {
  createBonus,
  createPlan,
  deleteBonus,
  getBonusById,
  setDefaultPlan,
  setPlanActive,
  updatePlanRates,
} from "@/lib/repositories/commissionPlanRepository";
import {
  countEnrollmentsForUserInPeriod,
  insertCommissionTransactions,
} from "@/lib/repositories/commissionTransactionRepository";
import { getUserById } from "@/lib/repositories/userRepository";
import { hasBonusBeenAwarded, recordBonusAward } from "@/lib/repositories/commissionPlanRepository";
import { evaluateBonusProgress } from "@/lib/commission-engine";
import type { ActionResult } from "@/app/(auth)/actions";

const PAYABLE_ROLES = ["agent", "manager", "owner"] as const;
type PayableRole = (typeof PAYABLE_ROLES)[number];

function isPayableRole(value: string): value is PayableRole {
  return (PAYABLE_ROLES as readonly string[]).includes(value);
}

export async function createCommissionPlan(
  _prevState: ActionResult | undefined,
  formData: FormData
): Promise<ActionResult> {
  try {
    const user = await requireRole(["owner"]);
    const name = String(formData.get("name") ?? "").trim();
    if (!name) {
      return { error: "Plan name is required." };
    }
    await createPlan(user.agencyId, name);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to create plan." };
  }

  revalidatePath("/settings");
  return {};
}

/**
 * Saves the full role x business-type rate grid for one plan in a single
 * submit. Field names follow `<role>_<businessType>`, e.g. `agent_new`.
 */
export async function updateCommissionPlanRates(
  _prevState: ActionResult | undefined,
  formData: FormData
): Promise<ActionResult> {
  try {
    const user = await requireRole(["owner"]);
    const planId = String(formData.get("planId") ?? "");
    if (!planId) return { error: "Missing plan." };

    const rates: { role: PayableRole; businessType: "new" | "renewal"; percent: number }[] = [];
    for (const role of PAYABLE_ROLES) {
      for (const businessType of ["new", "renewal"] as const) {
        const raw = formData.get(`${role}_${businessType}`);
        const percent = Number(raw);
        if (Number.isNaN(percent) || percent < 0) {
          return { error: "Percentages must be non-negative numbers." };
        }
        rates.push({ role, businessType, percent });
      }
    }

    await updatePlanRates(planId, user.agencyId, rates);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to update plan rates." };
  }

  revalidatePath("/settings");
  return {};
}

export async function setCommissionPlanDefault(
  _prevState: ActionResult | undefined,
  formData: FormData
): Promise<ActionResult> {
  try {
    const user = await requireRole(["owner"]);
    const planId = String(formData.get("planId") ?? "");
    if (!planId) return { error: "Missing plan." };
    await setDefaultPlan(user.agencyId, planId);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to set default plan." };
  }

  revalidatePath("/settings");
  revalidatePath("/users");
  return {};
}

export async function setCommissionPlanActive(
  _prevState: ActionResult | undefined,
  formData: FormData
): Promise<ActionResult> {
  try {
    await requireRole(["owner"]);
    const planId = String(formData.get("planId") ?? "");
    const active = formData.get("active") === "true";
    if (!planId) return { error: "Missing plan." };
    await setPlanActive(planId, active);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to update plan status." };
  }

  revalidatePath("/settings");
  revalidatePath("/users");
  return {};
}

export async function createCommissionPlanBonus(
  _prevState: ActionResult | undefined,
  formData: FormData
): Promise<ActionResult> {
  try {
    const user = await requireRole(["owner"]);
    const planId = String(formData.get("planId") ?? "");
    const role = String(formData.get("role") ?? "");
    const thresholdCount = Number(formData.get("thresholdCount"));
    const bonusAmount = Number(formData.get("bonusAmount"));

    if (!planId || !isPayableRole(role)) {
      return { error: "Invalid plan or role." };
    }
    if (!Number.isInteger(thresholdCount) || thresholdCount <= 0) {
      return { error: "Enrollment threshold must be a positive whole number." };
    }
    if (Number.isNaN(bonusAmount) || bonusAmount < 0) {
      return { error: "Bonus amount must be a non-negative number." };
    }

    await createBonus(user.agencyId, planId, { role, thresholdCount, bonusAmount });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to create bonus rule." };
  }

  revalidatePath("/settings");
  return {};
}

export async function deleteCommissionPlanBonus(
  _prevState: ActionResult | undefined,
  formData: FormData
): Promise<ActionResult> {
  try {
    await requireRole(["owner"]);
    const bonusId = String(formData.get("bonusId") ?? "");
    if (!bonusId) return { error: "Missing bonus rule." };
    await deleteBonus(bonusId);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to delete bonus rule." };
  }

  revalidatePath("/settings");
  return {};
}

/**
 * Owner-triggered, idempotent per (bonus, person, month): re-checks the
 * threshold server-side (never trusts the client's "qualified" state),
 * then inserts a one-off `role: "bonus"` commission transaction and marks
 * the award as paid so it can never be double-awarded for the same month.
 */
export async function awardCommissionPlanBonus(
  _prevState: ActionResult | undefined,
  formData: FormData
): Promise<ActionResult> {
  try {
    const currentUser = await requireRole(["owner"]);
    const bonusId = String(formData.get("bonusId") ?? "");
    const userId = String(formData.get("userId") ?? "");
    const period = String(formData.get("period") ?? "");

    if (!bonusId || !userId || !period) {
      return { error: "Missing bonus, teammate, or period." };
    }

    const [bonus, target] = await Promise.all([
      getBonusById(bonusId),
      getUserById(userId),
    ]);

    if (!bonus || bonus.agencyId !== currentUser.agencyId) {
      return { error: "Bonus rule not found." };
    }
    if (!target || target.agencyId !== currentUser.agencyId) {
      return { error: "Teammate not found." };
    }

    const alreadyAwarded = await hasBonusBeenAwarded(bonusId, userId, period);
    if (alreadyAwarded) {
      return { error: "This bonus was already awarded for that month." };
    }

    const enrollmentCount = await countEnrollmentsForUserInPeriod(
      userId,
      bonus.role as "agent" | "manager" | "owner",
      period
    );
    const { qualified } = evaluateBonusProgress(enrollmentCount, bonus.thresholdCount);
    if (!qualified) {
      return { error: "This teammate hasn't reached the enrollment threshold yet." };
    }

    const [transaction] = await insertCommissionTransactions([
      {
        agencyId: currentUser.agencyId,
        userId,
        opportunityId: `BONUS-${period}-${bonusId.slice(0, 8)}`,
        role: "bonus",
        businessType: "new",
        saleAmount: 0,
        commissionAmount: bonus.bonusAmount,
        commissionPlanId: bonus.commissionPlanId,
      },
    ]);

    await recordBonusAward({
      agencyId: currentUser.agencyId,
      bonusId,
      userId,
      period,
      commissionTransactionId: transaction.id,
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to award bonus." };
  }

  revalidatePath("/settings");
  revalidatePath("/dashboard");
  revalidatePath("/commissions");
  return {};
}
