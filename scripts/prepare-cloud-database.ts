import { loadProjectEnvFiles } from "../src/config/load-project-env";
import { resolvePostgresConnectionString } from "../src/config/postgres-connection";
import { ensurePostgresDatabaseReady } from "../src/db/postgres/ensure-database";

async function main(): Promise<void> {
  // `tsx` does not load Next's `.env*` files; without this, prepare falls back to
  // local Postgres even when `.env.local` points at hosted Postgres (e.g. Aiven).
  loadProjectEnvFiles();
  await ensurePostgresDatabaseReady(resolvePostgresConnectionString());
}

void main();
