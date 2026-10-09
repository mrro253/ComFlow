import type { StatementParser } from "@/lib/carriers/types";
import { ultimateParser } from "@/lib/carriers/ultimate/parseUltimateStatement";

export * from "@/lib/carriers/types";
export * from "@/lib/carriers/money";
export {
  classifyWritingAgent,
  normalizeWritingAgentName,
  writingAgentAliasesFor,
  type WritingAgentClassification,
  type WritingAgentOwner,
} from "@/lib/carriers/classifyWritingAgent";
export {
  planStatementImport,
  type ExistingTransaction,
  type ImportDisposition,
  type PlannedRow,
  type StatementImportPlan,
} from "@/lib/carriers/planStatementImport";

const PARSERS: readonly StatementParser[] = [ultimateParser];

/** Supported carriers, for UI pickers. */
export function listSupportedCarriers(): string[] {
  return PARSERS.map((parser) => parser.carrier);
}

/** Parser for a carrier name, or null if that carrier is not supported yet. */
export function getStatementParser(carrier: string): StatementParser | null {
  return PARSERS.find((parser) => parser.carrier === carrier) ?? null;
}
