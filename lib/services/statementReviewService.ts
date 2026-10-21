import { getStatementParser } from "@/lib/carriers";
import { sha256 } from "@/lib/carriers/digest";
import { extractStatementPdf } from "@/lib/pdf/extractStatementPdf";
import { downloadStatementPdf, listStatementCoverage, type StatementRecord } from "@/lib/repositories/statementRepository";
import { statementReviewLabel, type ReviewEvidence, type ReviewLabel } from "@/lib/reporting/statementReview";

/** All source paths come from this request's session/RLS-visible records. No persistent PHI cache. */
export async function listStatementReview(): Promise<{ statement: StatementRecord; label: ReviewLabel }[]> {
  const records = await listStatementCoverage();
  const pending = records.filter((s) => s.status === "received" || s.status === "previewed");
  if (!pending.length) return [];
  const cache = new Map<string, Promise<{ month: string; contentHash: string } | null>>();
  async function evidence(s: StatementRecord): Promise<ReviewEvidence> {
    const parser = getStatementParser(s.carrier);
    const key = JSON.stringify([s.carrier, s.storagePath, s.fileHash]);
    if (!cache.has(key)) cache.set(key, (async () => {
      if (!parser || !s.storagePath) return null;
      try {
        const bytes = await downloadStatementPdf(s.storagePath);
        if (sha256(bytes) !== s.fileHash) return null;
        const extracted = await extractStatementPdf(bytes, s.carrier);
        const parsed = parser.parse(extracted.text, s.fileHash);
        // Preserve every extracted field, including identities and printed balances.
        return { month: parsed.statementMonth, contentHash: sha256(new TextEncoder().encode(extracted.text)) };
      } catch { return null; }
    })());
    const source = await cache.get(key)!;
    return { carrier: s.carrier, userId: s.userId, month: source?.month ?? s.statementMonth, contentHash: source?.contentHash ?? null };
  }
  const result: { statement: StatementRecord; label: ReviewLabel }[] = [];
  // Sequential reads bound memory and storage/PDF extraction concurrency.
  for (const statement of pending) {
    const incoming = await evidence(statement);
    const prior: ReviewEvidence[] = [];
    for (const s of records) {
      if (s.status === "imported" && !s.supersededAt && s.carrier === incoming.carrier && s.userId === incoming.userId && s.statementMonth === incoming.month) prior.push(await evidence(s));
    }
    result.push({ statement: { ...statement, statementMonth: incoming.month }, label: statementReviewLabel(incoming, prior) });
  }
  return result.sort((a, b) => b.statement.createdAt.localeCompare(a.statement.createdAt));
}
