"use server";
import { requireRole } from "@/lib/auth/requireRole";
import { assignSale, setSaleDisposition } from "@/lib/services/saleDispositionService";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
export async function saveDisposition(form: FormData) {
  const user = await requireRole(["owner", "agent"]);
  const hash = String(form.get("collection") ?? "");
  const code = String(form.get("code") ?? "");
  await setSaleDisposition(user, String(form.get("owner") ?? ""), hash, code, String(form.get("status") ?? ""), String(form.get("note") ?? ""));
  revalidatePath("/sales"); revalidatePath("/carriers/sunfire/matches");
  redirect(`/sales?collection=${encodeURIComponent(hash)}&q=${encodeURIComponent(code)}`);
}
export async function saveSaleAssignment(form: FormData) {
  const user = await requireRole(["owner"]);
  const hash = String(form.get("collection") ?? ""), code = String(form.get("code") ?? "");
  await assignSale(user, hash, code, String(form.get("agent") ?? "") || null);
  revalidatePath("/sales");
  redirect(`/sales?collection=${encodeURIComponent(hash)}&q=${encodeURIComponent(code)}`);
}
