/** Read-only local readiness check. Never imports, updates, logs member fields, or starts workers. */
import { createDb } from "../worker/src/db";
import { extractPdfText } from "../lib/pdf/extractPdfText";
import { extractStatementPdf } from "../lib/pdf/extractStatementPdf";
import { parseUltimateText } from "../lib/carriers/ultimate/parseUltimateStatement";
import { readUhcStatement } from "../lib/carriers/uhc/parseUhcStatement";
import { readDevotedWorkbook } from "../lib/workbooks/readDevotedWorkbook";
import { parseDevotedPair } from "../lib/carriers/devoted/parseDevotedPair";
import { sha256 } from "../lib/carriers/digest";

class ReadinessCheckError extends Error {}

async function main() {
  const url = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");
  const agency = process.env.READINESS_AGENCY_ID ?? "";
  if (!["localhost", "127.0.0.1"].includes(url.hostname) || !/^[a-f0-9-]{36}$/i.test(agency)) throw new ReadinessCheckError("Local scope required");
  const db = createDb();
  const parents = await db.from("commission_statements").select("*").eq("agency_id", agency).eq("status", "imported").is("superseded_at", null);
  if (parents.error || !parents.data?.length || parents.data.length >= 1000) throw new ReadinessCheckError("Incomplete statement scope");
  const inventory = await db.from("carrier_transactions").select("*").eq("agency_id", agency).is("superseded_at", null).in("statement_id", parents.data.map(row => row.id));
  if (inventory.error || inventory.data.length >= 1000) throw new ReadinessCheckError("Incomplete entry scope");
  const download = async (path: string | null) => {
    if (!path?.startsWith(`${agency}/`) || path.split("/").some(part => part === "." || part === "..")) throw new ReadinessCheckError("Invalid source scope");
    const result = await db.storage.from("statements").download(path);
    if (result.error || !result.data) throw new ReadinessCheckError("Missing saved source");
    return new Uint8Array(await result.data.arrayBuffer());
  };
  const totals = new Map<string, { statements: number; entries: number }>();
  for (const parent of parents.data) {
    let parsed;
    if (parent.carrier === "Devoted Health") {
      const sources = await db.from("commission_statement_sources").select("*").eq("agency_id", agency).eq("statement_id", parent.id);
      if (sources.error || sources.data?.length !== 2) throw new ReadinessCheckError("Missing paired sources");
      const read = async (kind: string) => {
        const source = sources.data.find(row => row.source_kind === kind);
        if (!source) throw new ReadinessCheckError("Missing pair member");
        const bytes = await download(source.storage_path);
        if (bytes.length !== source.byte_size || sha256(bytes) !== source.sha256) throw new ReadinessCheckError("Source integrity mismatch");
        return bytes;
      };
      const pdfBytes = await read("pdf"), workbookBytes = await read("workbook");
      const pdf = await extractPdfText(pdfBytes), workbook = await readDevotedWorkbook(workbookBytes);
      const pair = parseDevotedPair({ ...workbook, pdfText: pdf.text, pdfHash: pdf.sha256, workbookHash: sha256(workbookBytes) });
      if (pair.pairHash !== parent.source_pair_hash || pair.payeeHash !== parent.devoted_payee_hash || pair.payDate !== parent.statement_pay_date || pair.periodStart !== parent.payment_period_start || pair.periodEnd !== parent.payment_period_end) throw new ReadinessCheckError("Pair identity mismatch");
      parsed = pair.statement;
    } else {
      const bytes = await download(parent.storage_path);
      if (parent.carrier === "UnitedHealthcare") {
        const pdf = await extractStatementPdf(bytes, parent.carrier);
        parsed = readUhcStatement(pdf.text, pdf.sha256).statement;
      } else if (parent.carrier === "Ultimate Health Plans") {
        const pdf = await extractPdfText(bytes);
        parsed = parseUltimateText(pdf.text, pdf.sha256);
      } else throw new ReadinessCheckError("Unsupported carrier in readiness scope");
    }
    const rows = inventory.data.filter(row => row.statement_id === parent.id);
    const sum = rows.reduce((amount, row) => amount + row.amount_cents, 0);
    // Zero-dollar events remain in the original file; the importer intentionally omits them from the monetary ledger.
    const sourceRows = new Map(parsed.transactions.map(row => [row.transactionKey, row]));
    if (parsed.sourceHash !== parent.file_hash || parsed.statementMonth !== parent.statement_month || parsed.statementTotalCents !== parent.statement_total_cents || parsed.carriedBalanceCents !== parent.carried_balance_cents || parsed.transactionTotalCents !== sum || parsed.statementTotalCents !== sum + parsed.carriedBalanceCents || rows.length !== parent.transaction_count || rows.length !== parsed.transactions.filter(row => row.amountCents !== 0).length) throw new ReadinessCheckError(`Statement reconciliation mismatch (${parent.carrier}): ${JSON.stringify({hash:parsed.sourceHash===parent.file_hash,month:parsed.statementMonth===parent.statement_month,printedTotal:parsed.statementTotalCents===parent.statement_total_cents,balance:parsed.carriedBalanceCents===parent.carried_balance_cents,entryTotal:parsed.transactionTotalCents===sum,equation:parsed.statementTotalCents===sum+parsed.carriedBalanceCents,storedCount:rows.length===parent.transaction_count,sourceCount:rows.length===parsed.transactions.filter(row=>row.amountCents!==0).length})}`);
    for (const row of rows) {
      const source = sourceRows.get(row.transaction_key);
      if (!source || source.memberId !== row.carrier_member_id || source.amountCents !== row.amount_cents || source.effectiveDateIso !== row.effective_date || source.type !== row.commission_type) throw new ReadinessCheckError("Entry/source mismatch");
    }
    const current = totals.get(parent.carrier) ?? { statements: 0, entries: 0 };
    current.statements++; current.entries += rows.length; totals.set(parent.carrier, current);
  }
  console.log(JSON.stringify({ readOnly: true, allSourcesAndTotalsVerified: true, carriers: Object.fromEntries(totals), statements: parents.data.length, entries: inventory.data.length }));
}
main().catch(error => { console.error(error instanceof ReadinessCheckError ? error.message : "Read-only statement verification failed. No records were changed; inspect the private source locally."); process.exitCode = 1; });
