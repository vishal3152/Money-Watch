import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { afterEach, describe, expect, it } from "vitest";

import { inspectDatabasePath } from "@/db/inspect-database-path";
import * as schema from "@/db/schema";

const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function tempDir() {
  const directory = mkdtempSync(join(tmpdir(), "paisa-watch-inspect-"));
  directories.push(directory);
  return directory;
}

function migratedDatabasePath() {
  const directory = tempDir();
  const databasePath = join(directory, "paisa-watch.db");
  const sqlite = new Database(databasePath);
  migrate(drizzle(sqlite, { schema }), { migrationsFolder: resolve(process.cwd(), "drizzle") });
  sqlite.close();
  return databasePath;
}

describe("inspectDatabasePath", () => {
  it("reports 'new' for a path that doesn't exist yet, without creating anything", () => {
    const directory = tempDir();
    const databasePath = join(directory, "does-not-exist.db");

    const result = inspectDatabasePath(databasePath);

    expect(result).toEqual({ kind: "new" });
  });

  it("reports zero counts for a freshly migrated, empty database", () => {
    const databasePath = migratedDatabasePath();

    const result = inspectDatabasePath(databasePath);

    expect(result).toEqual({
      kind: "existing",
      counts: { institutions: 0, accounts: 0, fixedDeposits: 0, transactions: 0 }
    });
  });

  it("counts existing rows in a populated database", () => {
    const databasePath = migratedDatabasePath();
    const sqlite = new Database(databasePath);
    sqlite.prepare("INSERT INTO institutions (id, name) VALUES (?, ?)").run("inst-1", "DBS Bank");
    sqlite
      .prepare(
        "INSERT INTO accounts (id, institution_id, name, currency_code) VALUES (?, ?, ?, ?)"
      )
      .run("acc-1", "inst-1", "Savings", "SGD");
    sqlite.close();

    const result = inspectDatabasePath(databasePath);

    expect(result).toEqual({
      kind: "existing",
      counts: { institutions: 1, accounts: 1, fixedDeposits: 0, transactions: 0 }
    });
  });

  it("reports 'unreadable' for a file that isn't a SQLite database", () => {
    const directory = tempDir();
    const databasePath = join(directory, "not-a-database.db");
    writeFileSync(databasePath, "not a sqlite file");

    const result = inspectDatabasePath(databasePath);

    expect(result).toEqual({ kind: "unreadable" });
  });
});
