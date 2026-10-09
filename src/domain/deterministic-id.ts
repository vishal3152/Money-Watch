import { createHash } from "node:crypto";

/**
 * A stable, UUID-shaped id derived from arbitrary hash material — used wherever a caller needs the
 * same logical write to always land on the same primary key (a crash-then-retry must not double-write),
 * rather than a fresh `crypto.randomUUID()` per call. Shared by email alert sync
 * (`src/email-sync/email-alert-import-ids.ts`) and MCP import's client-supplied idempotency key
 * (`src/app/api/mcp/tools.ts`'s `commit_import`/`commit_stock_import`).
 */
export function uuidFromHash(material: string): string {
  const hex = createHash("sha256").update(material).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}
