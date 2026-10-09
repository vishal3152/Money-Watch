import { existsSync } from "node:fs";

import Database from "better-sqlite3";

export type DatabasePathInspection =
  | { kind: "new" }
  | {
      kind: "existing";
      counts: {
        institutions: number;
        accounts: number;
        fixedDeposits: number;
        transactions: number;
      };
    }
  | { kind: "unreadable" };

function countRows(db: Database.Database, table: string): number {
  try {
    const row = db.prepare(`SELECT COUNT(*) as count FROM ${table}`).get() as
      | { count: number }
      | undefined;
    return row?.count ?? 0;
  } catch {
    // Table doesn't exist yet (an unmigrated/empty file) — treat as zero rather than failing
    // the whole preview.
    return 0;
  }
}

/**
 * Read-only, side-effect-free look at what a candidate database path currently holds, so the
 * Settings screen can show what switching to it would mean before it actually happens. Never
 * opens the path in a mode that would create or migrate a file — that write only happens on an
 * actual save (`saveDatabasePath`).
 */
export function inspectDatabasePath(databasePath: string): DatabasePathInspection {
  if (!existsSync(databasePath)) {
    return { kind: "new" };
  }

  let db: Database.Database;
  try {
    db = new Database(databasePath, { readonly: true, fileMustExist: true });
  } catch {
    return { kind: "unreadable" };
  }

  try {
    // SQLite defers file-format validation until first access — opening above can succeed
    // even against a non-database file. Force that validation before trusting any row counts.
    db.pragma("quick_check");
  } catch {
    db.close();
    return { kind: "unreadable" };
  }

  try {
    return {
      kind: "existing",
      counts: {
        institutions: countRows(db, "institutions"),
        accounts: countRows(db, "accounts"),
        fixedDeposits: countRows(db, "fixed_deposits"),
        transactions: countRows(db, "transactions")
      }
    };
  } finally {
    db.close();
  }
}
