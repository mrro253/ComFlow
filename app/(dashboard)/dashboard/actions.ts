"use server";
import { requireRole } from "@/lib/auth/requireRole";
import { acknowledgeChargeback } from "@/lib/services/attentionService";
import { revalidatePath } from "next/cache";
export async function markChargebackReviewed(form: FormData) {
  const user = await requireRole();
  await acknowledgeChargeback(user, String(form.get("review") ?? ""));
  revalidatePath("/dashboard");
}
