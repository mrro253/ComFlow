import { mkdirSync, writeFileSync, copyFileSync } from "node:fs";
import { makeTextPdf } from "../lib/pdf/__fixtures__/makeTextPdf";
import { syntheticPair } from "../lib/carriers/devoted/__fixtures__/syntheticPair";
mkdirSync(".pgtest", { recursive: true });
writeFileSync(".pgtest/devoted-synthetic.pdf", makeTextPdf(syntheticPair().pdfText.split("\n")));
copyFileSync("lib/workbooks/__fixtures__/devoted-synthetic.xlsx", ".pgtest/devoted-synthetic.xlsx");
console.log("Synthetic Devoted pair created in .pgtest; contains no real client data.");
