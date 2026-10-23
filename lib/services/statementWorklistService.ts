import { listStatementCoverage, downloadStatementPdf, type StatementRecord } from "@/lib/repositories/statementRepository";
import { statementWorklists } from "@/lib/reporting/attention";
import { canManageStatements } from "@/lib/auth/statementAccess";
import { digest } from "@/lib/carriers/digest";
import { extractStatementPdf } from "@/lib/pdf/extractStatementPdf";
import { extractUltimateDetails } from "@/lib/pdf/extractUltimateDetails";
import { parseUltimateText } from "@/lib/carriers/ultimate/parseUltimateStatement";
import { verifiedUltimateDetails } from "@/lib/carriers/ultimate/statementDetails";
import { readUhcStatement } from "@/lib/carriers/uhc/parseUhcStatement";
import type { CurrentUser } from "@/types/domain";
import { listDevotedInbox } from "@/lib/repositories/devotedInboxRepository";

export async function getStatementWorklists(user: CurrentUser) {
  if (!user.active || !canManageStatements(user)) throw new Error("Statement access required.");
  const [statements, downloadedPairs] = await Promise.all([listStatementCoverage(),
    user.role === "owner" && process.env.DEVOTED_REVIEW_ENABLED === "true" ? listDevotedInbox(user) : []]); // Session/RLS-scoped before any privileged PDF reads.
  const initial = statementWorklists(statements);
  const pending = initial.needsAttention.filter(row => ["Ultimate Health Plans", "UnitedHealthcare"].includes(row.carrier));
  const candidates = initial.imported.filter(saved => pending.some(row => row.carrier === saved.carrier && row.userId === saved.userId && (!row.statementMonth || row.statementMonth === saved.statementMonth)));
  const sources = [...pending, ...candidates];
  if (sources.length > 500) return { statements, downloadedPairs, ...initial }; // Conservative fallback; never hide unverified copies.
  const signatures = new Map<string, string>();
  async function signature(row: StatementRecord) {
    if (!row.storagePath?.startsWith(`${user.agencyId}/`) || row.storagePath.split("/").some(part => part === ".." || part === ".")) return;
    try {
      const bytes = await downloadStatementPdf(row.storagePath);
      const extracted = await extractStatementPdf(bytes, row.carrier);
      if (extracted.sha256 !== row.fileHash) return;
      const uhc = row.carrier === "UnitedHealthcare" ? readUhcStatement(extracted.text, extracted.sha256) : null;
      const parsed = uhc?.statement ?? parseUltimateText(extracted.text, extracted.sha256);
      const details = [...verifiedUltimateDetails(parsed.transactions, uhc?.details ?? await extractUltimateDetails(bytes)).values()];
      // Retain every printed token and coordinate-verified field, including Notes and payment identifiers.
      signatures.set(row.id, digest({ printedText: extracted.text.replace(/\s+/g, " ").trim(), details }));
    } catch { /* An unavailable/unsupported source remains a review item. Never log PDF content. */ }
  }
  for (const row of sources) await signature(row);
  const copies = new Map<string, string>();
  for (const row of pending) {
    const fingerprint = signatures.get(row.id);
    const saved = fingerprint && candidates.find(imported => imported.carrier === row.carrier && imported.userId === row.userId && signatures.get(imported.id) === fingerprint);
    if (saved) copies.set(row.id, saved.id);
  }
  return { statements, downloadedPairs, ...statementWorklists(statements, copies) };
}
