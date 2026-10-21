/** Synthetic-only fixture SQL for the isolated database. Contains no network or database client. */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { buildImportRegressionCases, syntheticImportOwners } from "../lib/carriers/__tests__/fixtures/importRegressionCases";
import { buildStatementPreview, toImportRows } from "../lib/carriers/buildStatementPreview";

async function main() {
  const cases = await buildImportRegressionCases();
  const payload = cases.map(c => ({ carrier: c.carrier, ...Object.fromEntries(
    (["original", "corrected"] as const).map(version => {
      const { statement, pair } = c[version];
      return [version, { hash: statement.sourceHash, month: statement.statementMonth, total: statement.statementTotalCents,
        balance: statement.carriedBalanceCents, rows: toImportRows(buildStatementPreview(statement, syntheticImportOwners(statement), [])),
        pair: pair ? { hash: pair.pairHash, workbook: pair.workbookHash, payDate: pair.payDate, payee: pair.payeeHash,
          start: pair.periodStart, end: pair.periodEnd, parser: pair.parserVersion } : null }];
    })
  ) }));
  const json = JSON.stringify(payload).replace(/'/g, "''");
  const sql = `do $fixtures$ begin perform set_config('statement_regression.cases','${json}',false); end $fixtures$;\n` +
    await readFile("supabase/tests/statement_import_regressions.sql", "utf8");
  await mkdir(".pgtest", { recursive: true });
  await writeFile(".pgtest/statement-import-regressions.sql", sql);
  console.log("Prepared three synthetic carrier cases. Run only against the isolated synthetic database; all cases roll back.");
}
main().catch(() => { console.error("Synthetic fixture generation failed"); process.exitCode = 1; });
