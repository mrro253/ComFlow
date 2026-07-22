import { evaluateBonusProgress } from "@/lib/commission-engine";
import {
  countEnrollmentsForUserInPeriod,
  dateToPeriod,
} from "@/lib/repositories/commissionTransactionRepository";
import { hasBonusBeenAwarded } from "@/lib/repositories/commissionPlanRepository";
import type {
  AppUser,
  CommissionPlanBonus,
  CommissionPlanWithDetails,
} from "@/types/domain";

export interface BonusProgressRow {
  user: AppUser;
  bonus: CommissionPlanBonus;
  planName: string;
  period: string;
  enrollmentCount: number;
  qualified: boolean;
  remaining: number;
  alreadyAwarded: boolean;
}

/**
 * For every user with at least one bonus rule on their (assigned or
 * default) plan for their role, computes their current-month progress
 * toward it. Drives the "Bonuses" card in Settings, where an Owner can
 * manually award any row that's qualified and not yet awarded.
 */
export async function buildBonusProgressRows(
  users: AppUser[],
  plans: CommissionPlanWithDetails[],
  period: string = dateToPeriod()
): Promise<BonusProgressRow[]> {
  const defaultPlan = plans.find((p) => p.isDefault);
  const planById = new Map(plans.map((p) => [p.id, p]));

  const rows: BonusProgressRow[] = [];

  for (const user of users) {
    const planId = user.commissionPlanId ?? defaultPlan?.id;
    const plan = planId ? planById.get(planId) : undefined;
    if (!plan) continue;

    const bonusesForRole = plan.bonuses.filter((b) => b.role === user.role);
    for (const bonus of bonusesForRole) {
      const [enrollmentCount, alreadyAwarded] = await Promise.all([
        countEnrollmentsForUserInPeriod(user.id, user.role, period),
        hasBonusBeenAwarded(bonus.id, user.id, period),
      ]);
      const { qualified, remaining } = evaluateBonusProgress(
        enrollmentCount,
        bonus.thresholdCount
      );

      rows.push({
        user,
        bonus,
        planName: plan.name,
        period,
        enrollmentCount,
        qualified,
        remaining,
        alreadyAwarded,
      });
    }
  }

  return rows.sort((a, b) => {
    if (a.alreadyAwarded !== b.alreadyAwarded) return a.alreadyAwarded ? 1 : -1;
    if (a.qualified !== b.qualified) return a.qualified ? -1 : 1;
    return b.enrollmentCount - a.enrollmentCount;
  });
}
