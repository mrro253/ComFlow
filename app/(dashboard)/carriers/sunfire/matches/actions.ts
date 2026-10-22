"use server";
import { requireRole } from "@/lib/auth/requireRole";
import { confirmSunfireLinks } from "@/lib/services/sunfireLinkService";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export async function confirmMatches(form: FormData) {
  const user = await requireRole(["owner"]);
  const hash = String(form.get("collection") ?? "");
  const expected = String(form.get("plan") ?? "");
  await confirmSunfireLinks(user, hash, expected);
  revalidatePath("/carriers/sunfire/matches");
  redirect(`/carriers/sunfire/matches?collection=${encodeURIComponent(hash)}&filter=chargebacks`);
}
