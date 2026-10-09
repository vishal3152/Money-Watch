import { readFileSync } from "node:fs";
import path from "node:path";

import { createDb } from "../../src/db/client";
import type { DemoSeedData } from "../../src/demo-data/generate-seed-data";
import { loadDemoSeedData } from "../../src/demo-data/load-demo-seed";

async function main(): Promise<void> {
  const seedPath = path.join(__dirname, "..", "..", "public", "demo-data", "seed-data.json");
  const data = JSON.parse(readFileSync(seedPath, "utf8")) as DemoSeedData;
  const db = createDb();
  const result = await loadDemoSeedData(db, data);
  console.log("Loaded demo seed:", result);
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
