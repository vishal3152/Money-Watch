import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { generateDemoSeedData } from "../../src/demo-data/generate-seed-data";

const root = path.join(__dirname, "..", "..");
const outDir = path.join(root, "public", "demo-data");
const outFile = path.join(outDir, "seed-data.json");

mkdirSync(outDir, { recursive: true });
const data = generateDemoSeedData();
writeFileSync(outFile, `${JSON.stringify(data, null, 2)}\n`, "utf8");

console.log(
  `Wrote ${outFile} (${data.institutions.length} institutions, ${data.accounts.length} accounts, ${data.fixedDeposits.length} FDs, ${data.transactions.length} transactions, ${data.transfers.length} transfers)`
);
