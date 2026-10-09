"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/requireRole";
import { sha256 } from "@/lib/carriers/digest";
import { getStatementParser } from "@/lib/carriers";
import { assertPdfBytes } from "@/lib/pdf/extractPdfText";
import {
  findStatementByHash,
  getStatement,
  insertStatement,
  uploadStatementPdf,
} from "@/lib/repositories/statementRepository";
import { listUsersForAgency } from "@/lib/repositories/userRepository";
import { importStatement } from "@/lib/services/statementService";
import type { ActionResult } from "@/app/(auth)/actions";

/**
 * Upload a carrier statement PDF. Nothing is imported yet: the Owner reviews a
 * preview first. Identical files (same SHA-256) are never stored twice.
 */
export async function uploadStatement(
  _prev: ActionResult | undefined,
  formData: FormData
): Promise<ActionResult> {
  let statementId: string;
  try {
    const user = await requireRole(["owner"]);

    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) return { error: "Choose a PDF to upload." };

    const carrier = String(formData.get("carrier") ?? "");
    if (!getStatementParser(carrier)) return { error: "Choose a supported carrier." };

    const bytes = new Uint8Array(await file.arrayBuffer());
    assertPdfBytes(bytes);
    const fileHash = sha256(Buffer.from(bytes));

    // Optional: the statement belongs to an Independent agent rather than the agency.
    const ownerUserId = String(formData.get("ownerUserId") ?? "") || null;
    if (ownerUserId) {
      const team = await listUsersForAgency(user.agencyId);
      const target = team.find((u) => u.id === ownerUserId);
      if (!target || target.agentType !== "independent" || target.role === "owner") {
        return { error: "Statements can only be attributed to an independent agent on your team." };
      }
    }

    const existing = await findStatementByHash(user.agencyId, fileHash);
    if (existing) {
      statementId = existing.id; // Same file again: just take them to the existing record.
    } else {
      const storagePath = await uploadStatementPdf(user.agencyId, fileHash, bytes);
      const created = await insertStatement({
        agencyId: user.agencyId,
        carrier,
        userId: ownerUserId,
        fileHash,
        originalFilename: file.name.slice(0, 200),
        storagePath,
        uploadedBy: user.id,
      });
      statementId = created.id;
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Upload failed." };
  }

  revalidatePath("/statements");
  redirect(`/statements/${statementId}`);
}

/** Owner approval: re-builds the preview on the server and imports it atomically. */
export async function approveStatementImport(
  _prev: ActionResult | undefined,
  formData: FormData
): Promise<ActionResult> {
  try {
    const user = await requireRole(["owner"]);
    const statement = await getStatement(String(formData.get("statementId") ?? ""));
    if (!statement) return { error: "Statement not found." };

    const inserted = await importStatement(user, statement);

    revalidatePath("/statements");
    revalidatePath(`/statements/${statement.id}`);
    revalidatePath("/payments");
    revalidatePath("/dashboard");
    return { info: `Imported ${inserted} new payment${inserted === 1 ? "" : "s"}.` };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Import failed." };
  }
}
