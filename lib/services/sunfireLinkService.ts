import { getSunfireMatches } from "./sunfireMatchService";
import { readConfirmedSunfireLinks, appendSunfireLinkConfirmation } from "@/lib/repositories/sunfireLinkRepository";
import { linkPlan, isConfirmedLink } from "@/lib/enrollments/confirmedLinks";
import { digest } from "@/lib/carriers/digest";
import type { CurrentUser } from "@/types/domain";

export async function confirmSunfireLinks(user: CurrentUser, hash: string, expected: string) {
  if (!user.active || user.role !== "owner" || !/^[a-f0-9]{64}$/.test(hash)) throw new Error("Active owner and valid collection required.");
  const review = await getSunfireMatches(user, hash);
  const plan = linkPlan(review.matches);
  if (!review.current || digest(plan) !== expected) throw new Error("The comparison changed. Review it again before linking.");
  const saved = await readConfirmedSunfireLinks(user, hash);
  const pending = plan.filter(link => !isConfirmedLink(link, saved));
  await appendSunfireLinkConfirmation(user, hash, pending);
  return pending.length;
}
