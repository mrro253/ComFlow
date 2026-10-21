import { classifyWritingAgent, type WritingAgentIndex } from "@/lib/carriers/classifyWritingAgent";
import { buildStatementPreview } from "@/lib/carriers/buildStatementPreview";
import type { DevotedPair } from "./parseDevotedPair";

export interface DevotedPrior { id: string; pairHash: string; payDate: string; payeeHash: string }
export function previewDevoted(pair: DevotedPair, owners: WritingAgentIndex, prior: DevotedPrior[]) {
  const context = prior.filter((p) => p.payDate === pair.payDate && p.payeeHash === pair.payeeHash);
  const exact = context.find((p) => p.pairHash === pair.pairHash);
  const preview = buildStatementPreview(pair.statement, owners, [], null,
    exact ? { kind: "duplicate", of: { id: exact.id, filename: null } } : { kind: "none" });
  const blockers = [...preview.blockers];
  if (context.length > 1) blockers.push("Multiple current sources for this pay date/payee require review.");
  const replaces = exact ? [] : context.map((p) => p.id);
  const assignments = pair.statement.transactions.map((tx) => classifyWritingAgent(tx, owners));
  return { preview, replaces, existingIds: context.map((p) => p.id).sort(), assignments, blockers, duplicate: Boolean(exact) };
}
