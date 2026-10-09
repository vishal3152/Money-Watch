import path from "node:path";

import { ensureDatabaseReady } from "../src/desktop/ensure-database";

async function main(): Promise<void> {
  const databasePath = process.env.DATABASE_PATH;

  if (!databasePath) {
    throw new Error("DATABASE_PATH is required before preparing the desktop database.");
  }

  const migrationsFolder =
    process.env.MIGRATIONS_FOLDER !== undefined && process.env.MIGRATIONS_FOLDER.trim().length > 0
      ? process.env.MIGRATIONS_FOLDER.trim()
      : path.join(__dirname, "..", "drizzle");

  await ensureDatabaseReady({
    databasePath,
    migrationsFolder
  });
}

void main();
