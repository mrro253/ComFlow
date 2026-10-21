"use server";
import { DevotedValidationError, DevotedReviewError } from "@/lib/carriers/devoted/errors";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { devotedPreview, approveDevoted } from "@/lib/services/devotedPairService";

export async function reviewDevotedFiles(form: FormData) {
  const user = await getCurrentUser();
  if (!user || user.role !== "owner" || process.env.DEVOTED_REVIEW_ENABLED !== "true") return { error: "Devoted review is unavailable" };
  try {
    const pdf = form.get("pdf"), workbook = form.get("workbook");
    if (!(pdf instanceof File) || !(workbook instanceof File) || !pdf.size || !workbook.size || pdf.size > 15728640 || workbook.size > 15728640) return { error: "Select a PDF and OOXML workbook, each no larger than 15 MB" };
    const pdfBytes = new Uint8Array(await pdf.arrayBuffer()), workbookBytes = new Uint8Array(await workbook.arrayBuffer());
    if (form.get("operation") === "import") {
      const id = await approveDevoted(user, pdfBytes, workbookBytes, String(form.get("digest") ?? ""), form.get("replace") === "yes");
      for (const path of ["/statements", "/payments", "/dashboard"]) revalidatePath(path);
      return { importedId: id };
    }
    const result = await devotedPreview(user, pdfBytes, workbookBytes);
    return { result };
  } catch (error) {
    if (error instanceof DevotedValidationError || error instanceof DevotedReviewError) return { error: error.message };
    // Neither parser error details nor raw source rows belong in shared logs.
    return { error: "The pair could not be approved. It may have unsupported fields, mismatched totals/identities, a changed preview, or import may be disabled. No partial commission import was made. Review the source pair and try a fresh preview." };
  }
}
