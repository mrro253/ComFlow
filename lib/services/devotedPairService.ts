import { DevotedReviewError } from "@/lib/carriers/devoted/errors";
import { createHmac, timingSafeEqual } from "node:crypto";
import { sha256 } from "@/lib/carriers/digest";
import { parseDevotedPair } from "@/lib/carriers/devoted/parseDevotedPair";
import { previewDevoted } from "@/lib/carriers/devoted/preview";
import { readDevotedWorkbook } from "@/lib/workbooks/readDevotedWorkbook";
import { extractPdfText } from "@/lib/pdf/extractPdfText";
import { loadDevotedContext, registerAndImportDevoted } from "@/lib/repositories/devotedRepository";
import { toImportRows } from "@/lib/carriers/buildStatementPreview";
import type { CurrentUser } from "@/types/domain";

export async function parseDevotedBytes(pdfBytes: Uint8Array, workbookBytes: Uint8Array) {
  const [pdf, workbook] = await Promise.all([extractPdfText(pdfBytes), readDevotedWorkbook(workbookBytes)]);
  if (pdf.pages !== 1) throw new DevotedReviewError("Unsupported Devoted PDF page count");
  return parseDevotedPair({ pdfText: pdf.text, pdfHash: pdf.sha256, workbookHash: sha256(workbookBytes), ...workbook });
}
function requireOwner(user: CurrentUser) {
  if (!user.active || user.role !== "owner") throw new DevotedReviewError("Devoted review is restricted to the agency owner");
}
export async function devotedPreview(user: CurrentUser, pdf: Uint8Array, workbook: Uint8Array) {
  requireOwner(user);
  const pair = await parseDevotedBytes(pdf, workbook);
  const { owners, prior } = await loadDevotedContext(user.agencyId, pair.payDate, pair.payeeHash);
  const plan = previewDevoted(pair, owners, prior);
  const digest = createHmac("sha256", process.env.SUPABASE_SERVICE_ROLE_KEY!).update(JSON.stringify({ agency: user.agencyId, actor: user.id, pair: pair.pairHash, plan })).digest("hex");
  return { pair, plan, digest };
}
export async function approveDevoted(user: CurrentUser, pdf: Uint8Array, workbook: Uint8Array, expectedDigest: string, replace: boolean) {
  requireOwner(user);
  // Default off, even on the review branch. Never enables itself after a preview.
  if (process.env.DEVOTED_IMPORT_REVIEW_ENABLED !== "true") throw new DevotedReviewError("Devoted import is disabled pending review");
  const rebuilt = await devotedPreview(user, pdf, workbook);
  if (!/^[a-f0-9]{64}$/.test(expectedDigest) || !timingSafeEqual(Buffer.from(expectedDigest), Buffer.from(rebuilt.digest))) throw new DevotedReviewError("Preview has changed. Review a fresh preview before importing.");
  if (rebuilt.plan.duplicate) throw new DevotedReviewError("This source pair is already imported");
  if (rebuilt.plan.blockers.length) throw new DevotedReviewError("Resolve Devoted preview blockers before importing");
  if (rebuilt.plan.replaces.length && !replace) throw new DevotedReviewError("Explicit correction approval is required");
  return registerAndImportDevoted(user, rebuilt.pair, pdf, workbook, toImportRows(rebuilt.plan.preview), rebuilt.plan.existingIds, rebuilt.plan.replaces);
}
