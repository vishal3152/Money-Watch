import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

import { resolveDatabasePath } from "@/config/resolve-database-path";
import { DatabaseError } from "@/db/errors";
import * as schema from "@/db/schema";

export type DrizzleDb = BetterSQLite3Database<typeof schema>;

const migratedPaths = new Set<string>();

function ensureMigrated(resolvedPath: string): void {
  if (migratedPaths.has(resolvedPath)) {
    return;
  }

  let sqlite: Database.Database | undefined;

  try {
    mkdirSync(dirname(resolvedPath), { recursive: true });
    sqlite = new Database(resolvedPath);
    // Some table-rebuild migrations need FK checks disabled during the migration transaction.
    sqlite.pragma("foreign_keys = OFF");
    migrate(drizzle(sqlite, { schema }), { migrationsFolder: resolve(process.cwd(), "drizzle") });
    sqlite.pragma("foreign_keys = ON");
  } catch (error) {
    throw new DatabaseError("Failed to prepare the database.", { cause: error });
  } finally {
    sqlite?.close();
  }

  migratedPaths.add(resolvedPath);
}

export function createDb(databasePath?: string) {
  const resolvedPath = resolveDatabasePath(databasePath);
  ensureMigrated(resolvedPath);

  let sqlite: Database.Database | undefined;

  try {
    sqlite = new Database(resolvedPath);
    sqlite.pragma("foreign_keys = ON");

    return drizzle(sqlite, { schema });
  } catch (error) {
    sqlite?.close();
    throw new DatabaseError("Failed to open the database.", { cause: error });
  }
}
