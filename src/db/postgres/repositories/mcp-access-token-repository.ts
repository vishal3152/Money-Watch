import { eq } from "drizzle-orm";

import { getScopedDb } from "@/db/postgres/scoped-db";
import { mcpAccessTokens } from "@/db/postgres/schema";

export type McpAccessTokenSummary = {
  ownerId: string;
  createdAt: string;
};

/**
 * Per-Owner MCP cloud access token (ADR-0011) — the cloud-tier counterpart to local mode's
 * loopback-only trust. `get()` never returns the hash; only the Server Action layer that verifies
 * an incoming request's bearer token reads it, via `resolveOwnerIdByTokenHash` below.
 */
export class PgMcpAccessTokenRepository {
  constructor(
    private readonly connectionString: string,
    private readonly ownerId: string
  ) {}

  async get(): Promise<McpAccessTokenSummary | null> {
    const db = getScopedDb(this.connectionString);

    const rows = await db.select().from(mcpAccessTokens).where(eq(mcpAccessTokens.ownerId, this.ownerId));

    const row = rows[0];
    return row ? { ownerId: row.ownerId, createdAt: row.createdAt } : null;
  }

  /** Upsert on ownerId — regenerating replaces the previous hash, which stops matching immediately. */
  async set(tokenHash: string, createdAt: string): Promise<void> {
    const db = getScopedDb(this.connectionString);

    await db
      .insert(mcpAccessTokens)
      .values({ ownerId: this.ownerId, tokenHash, createdAt })
      .onConflictDoUpdate({
        target: mcpAccessTokens.ownerId,
        set: { tokenHash, createdAt }
      });
  }

  async revoke(): Promise<void> {
    const db = getScopedDb(this.connectionString);

    await db.delete(mcpAccessTokens).where(eq(mcpAccessTokens.ownerId, this.ownerId));
  }
}

/**
 * Cross-owner lookup: resolving *which* Owner a bearer token belongs to is the one thing this
 * feature must do before an ownerId is known, so — like `listAllEmailSyncCredentials` — this is a
 * deliberate exception to the per-Owner-scoped pattern every other repository method follows.
 * Only `src/app/api/mcp/route.ts` calls this, to authenticate an incoming cloud-mode MCP request.
 */
export async function resolveOwnerIdByTokenHash(connectionString: string, tokenHash: string): Promise<string | null> {
  const db = getScopedDb(connectionString);

  const rows = await db.select().from(mcpAccessTokens).where(eq(mcpAccessTokens.tokenHash, tokenHash));

  return rows[0]?.ownerId ?? null;
}
