import { mkdtempSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { afterEach } from "vitest";

import * as schema from "@/db/schema";

const openTestDatabases = new Set<() => void>();

afterEach(() => {
  for (const close of openTestDatabases) {
    close();
  }
});

export function createTestDb() {
  const directory = mkdtempSync(join(tmpdir(), "paisa-watch-"));
  const databasePath = join(directory, "test.db");
  const sqlite = new Database(databasePath);
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite, { schema });

  migrate(db, { migrationsFolder: resolve(process.cwd(), "drizzle") });

  let closed = false;
  const close = () => {
    if (closed) {
      return;
    }

    closed = true;
    openTestDatabases.delete(close);
    sqlite.close();
    rmSync(directory, { recursive: true, force: true });
  };

  openTestDatabases.add(close);

  return {
    db,
    close
  };
}
