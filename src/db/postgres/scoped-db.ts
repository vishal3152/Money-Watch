import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";

import { getPooledClient } from "@/db/postgres/connection-pool";

/**
 * Returns a Drizzle instance bound to the shared pooled connection. This is
 * NOT RLS-scoped: the connection runs as the table-owning role (bypasses
 * RLS), so every query here is entirely responsible for its own owner
 * isolation — filter every read by `ownerId`, and include `ownerId` in
 * every `update`/`delete` predicate, not just the entity id. See
 * `docs/adr/0006-drop-rls-for-app-layer-owner-filtering.md`.
 */
export function getScopedDb(connectionString: string): PostgresJsDatabase {
  return drizzle(getPooledClient(connectionString));
}
