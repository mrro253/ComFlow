"use server";
import { requireRole } from "@/lib/auth/requireRole";
import { confirmSunfireLinks } from "@/lib/services/sunfireLinkService";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { recordEnrollmentNotEffective } from "@/lib/services/sunfireFollowupService";

export async function confirmMatches(form: FormData) {
  const user = await requireRole(["owner"]);
  const hash = String(form.get("collection") ?? "");
  const expected = String(form.get("plan") ?? "");
  await confirmSunfireLinks(user, hash, expected);
  revalidatePath("/carriers/sunfire/matches");
  redirect(`/carriers/sunfire/matches?collection=${encodeURIComponent(hash)}&filter=chargebacks`);
}

export async function saveNotEffective(form: FormData) {
  const user = await requireRole(["owner"]);
  const hash = String(form.get("collection") ?? "");
  await recordEnrollmentNotEffective(user, hash, String(form.get("enrollmentCode") ?? ""), String(form.get("note") ?? ""));
  revalidatePath("/carriers/sunfire/matches");
  redirect(`/carriers/sunfire/matches?collection=${encodeURIComponent(hash)}&filter=resolved`);
}
