export interface BonusProgress {
  /** True once `enrollmentCount` has met or passed the threshold. */
  qualified: boolean;
  /** How many more enrollments are needed to qualify (0 once qualified). */
  remaining: number;
}

/**
 * Pure check for whether someone has hit a plan's monthly enrollment bonus
 * threshold. Has no idea *who* the person is or what period "this month"
 * means - callers (see `lib/repositories/commissionPlanRepository.ts`)
 * count enrollments for a specific user/role/calendar-month and pass the
 * count in here.
 *
 * Example: enrollmentCount=8, thresholdCount=10 -> { qualified: false, remaining: 2 }
 */
export function evaluateBonusProgress(
  enrollmentCount: number,
  thresholdCount: number
): BonusProgress {
  const remaining = Math.max(thresholdCount - enrollmentCount, 0);
  return { qualified: enrollmentCount >= thresholdCount, remaining };
}
