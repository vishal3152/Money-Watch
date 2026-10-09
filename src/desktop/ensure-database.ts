import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

import * as schema from "@/db/schema";
import { DatabaseError } from "@/db/errors";

export type EnsureDatabaseReadyOptions = {
  databasePath: string;
  migrationsFolder: string;
};

export async function ensureDatabaseReady({
  databasePath,
  migrationsFolder
}: EnsureDatabaseReadyOptions): Promise<void> {
  mkdirSync(dirname(databasePath), { recursive: true });

  let sqlite: Database.Database | undefined;

  try {
    sqlite = new Database(databasePath);
    sqlite.pragma("foreign_keys = ON");
    const db = drizzle(sqlite, { schema });
    migrate(db, { migrationsFolder });
  } catch (error) {
    throw new DatabaseError("Failed to prepare the database.", { cause: error });
  } finally {
    sqlite?.close();
  }
}
