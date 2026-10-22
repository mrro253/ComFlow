import { getSunfireMatches } from "./sunfireMatchService";
import { appendSunfireFollowup } from "@/lib/repositories/sunfireFollowupRepository";
import type { CurrentUser } from "@/types/domain";

export async function recordEnrollmentNotEffective(user: CurrentUser, hash: string, code: string, note: string) {
  if (!user.active || user.role !== "owner") throw new Error("Active owner required.");
  const review = await getSunfireMatches(user, hash);
  const enrollment = review.matches.find(row => row.enrollmentCode === code);
  if (!review.current || !enrollment) throw new Error("Enrollment not found in your collection.");
  if (enrollment.evidence.length > 0) throw new Error("Statement evidence exists. Review it before recording that no commission is expected.");
  await appendSunfireFollowup(user, hash, code, note.trim());
}
