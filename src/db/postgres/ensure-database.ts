import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import postgres from "postgres";

import { DatabaseError } from "@/db/errors";
import { SUPABASE_COMPAT_BOOTSTRAP_SQL } from "@/db/postgres/supabase-compat";

/**
 * Tracking table name is retained from the former `supabase db push` path so
 * already-applied cloud databases (Aiven, etc.) are not re-migrated.
 */
const MIGRATION_TRACKING_BOOTSTRAP_SQL = `
create schema if not exists supabase_migrations;

create table if not exists supabase_migrations.schema_migrations (
  version text primary key,
  statements text[],
  name text
);
`;

export function resolvePostgresMigrationsFolder(): string {
  const fromEnv = process.env.POSTGRES_MIGRATIONS_FOLDER;
  if (fromEnv !== undefined && fromEnv.trim().length > 0) {
    return fromEnv.trim();
  }
  return join(process.cwd(), "postgres", "migrations");
}

export function migrationVersionFromFilename(filename: string): string {
  const match = /^(\d+)_.*\.sql$/.exec(filename);
  if (match === null) {
    throw new DatabaseError(`Postgres migration filename is not version-prefixed: ${filename}`);
  }
  return match[1]!;
}

export function listPendingPostgresMigrationFiles(
  migrationsFolder: string,
  appliedVersions: ReadonlySet<string>
): string[] {
  return readdirSync(migrationsFolder)
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .filter((name) => !appliedVersions.has(migrationVersionFromFilename(name)));
}

export async function ensurePostgresDatabaseReady(connectionString: string): Promise<void> {
  const migrationsFolder = resolvePostgresMigrationsFolder();
  const sql = postgres(connectionString, { max: 1 });

  try {
    try {
      await sql.unsafe(SUPABASE_COMPAT_BOOTSTRAP_SQL);
    } catch (error) {
      throw new DatabaseError("Failed to prepare Supabase-compat primitives on Postgres.", {
        cause: error
      });
    }

    await sql.unsafe(MIGRATION_TRACKING_BOOTSTRAP_SQL);
    const appliedRows = (await sql`
      select version from supabase_migrations.schema_migrations
    `) as { version: string }[];
    const appliedVersions = new Set(appliedRows.map((row) => row.version));
    const pending = listPendingPostgresMigrationFiles(migrationsFolder, appliedVersions);

    for (const filename of pending) {
      const version = migrationVersionFromFilename(filename);
      const name = filename.replace(/\.sql$/, "");
      const body = readFileSync(join(migrationsFolder, filename), "utf8");

      await sql.begin(async (tx) => {
        await tx.unsafe(body);
        await tx`
          insert into supabase_migrations.schema_migrations (version, name)
          values (${version}, ${name})
        `;
      });
    }
  } catch (error) {
    if (error instanceof DatabaseError) {
      throw error;
    }
    throw new DatabaseError("Failed to prepare the cloud database.", { cause: error });
  } finally {
    await sql.end({ timeout: 5 });
  }
}
