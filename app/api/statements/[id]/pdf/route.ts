import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { canAccessStatement } from "@/lib/auth/statementAccess";
import {
  downloadStatementPdf,
  getStatement,
  recordAuditEvent,
} from "@/lib/repositories/statementRepository";

/**
 * Streams the stored statement PDF so the viewer can check the numbers against
 * the original. The PDF is PHI: never cached, every view is audited, and only
 * the agency Owner or the Independent whose book it is may open it.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const { id } = await params;
  const statement = await getStatement(id);
  if (!statement?.storagePath || !canAccessStatement(user, statement)) {
    return new Response("Not found", { status: 404 });
  }

  let bytes: Uint8Array;
  try {
    bytes = await downloadStatementPdf(statement.storagePath);
  } catch {
    return new Response("The PDF could not be read", { status: 502 });
  }

  await recordAuditEvent({
    agencyId: user.agencyId,
    actorId: user.id,
    action: "statement.pdf_viewed",
    entityType: "commission_statement",
    entityId: statement.id,
  });

  const filename = (statement.originalFilename ?? "statement.pdf").replace(/[^\w.\- ]/g, "_");
  return new Response(bytes as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
