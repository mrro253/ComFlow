import { writeFileSync } from "node:fs";
import { buildSampleStatementLines } from "../lib/carriers/sampleStatement";
import { makeTextPdf } from "../lib/pdf/__fixtures__/makeTextPdf";

// Run via `npm run sample:statement` (which executes from worker/, so the project root is "..").
// Optional month: npm run sample:statement -- "October 2026"
const month = process.argv[2] ?? "September 2026";
const out = "../sample-statement.pdf";
writeFileSync(out, makeTextPdf(buildSampleStatementLines(month)));
console.log("Wrote sample-statement.pdf in the project root (synthetic data only, safe to share).");
console.log("Upload it on the Statements page.");
