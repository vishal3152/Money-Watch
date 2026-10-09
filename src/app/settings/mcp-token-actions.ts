"use server";

import { generateMcpAccessToken as generateToken } from "@/domain/mcp-access-token";
import { getCurrentOwnerId as getCurrentOwnerIdFn } from "@/lib/cloud-auth/current-owner";
import type { LocalizedText } from "@/i18n/translator";

export type McpAccessTokenSummary = { createdAt: string } | null;

async function defaultReadToken(ownerId: string): Promise<{ createdAt: string } | null> {
  const { PgMcpAccessTokenRepository } = await import("@/db/postgres/repositories/mcp-access-token-repository");
  const { resolvePostgresConnectionString } = await import("@/config/postgres-connection");
  return new PgMcpAccessTokenRepository(resolvePostgresConnectionString(), ownerId).get();
}

async function defaultSaveToken(ownerId: string, tokenHash: string, createdAt: string): Promise<void> {
  const { PgMcpAccessTokenRepository } = await import("@/db/postgres/repositories/mcp-access-token-repository");
  const { resolvePostgresConnectionString } = await import("@/config/postgres-connection");
  await new PgMcpAccessTokenRepository(resolvePostgresConnectionString(), ownerId).set(tokenHash, createdAt);
}

async function defaultRevokeToken(ownerId: string): Promise<void> {
  const { PgMcpAccessTokenRepository } = await import("@/db/postgres/repositories/mcp-access-token-repository");
  const { resolvePostgresConnectionString } = await import("@/config/postgres-connection");
  await new PgMcpAccessTokenRepository(resolvePostgresConnectionString(), ownerId).revoke();
}

export type GetMcpAccessTokenSummaryDeps = {
  getCurrentOwnerId?: () => Promise<string | null>;
  readToken?: (ownerId: string) => Promise<{ createdAt: string } | null>;
};

/** Never returns the token itself — only whether one exists and when it was generated. */
export async function getMcpAccessTokenSummary(
  deps: GetMcpAccessTokenSummaryDeps = {}
): Promise<McpAccessTokenSummary> {
  const ownerId = await (deps.getCurrentOwnerId ?? getCurrentOwnerIdFn)();
  if (ownerId === null) {
    return null;
  }

  const token = await (deps.readToken ?? defaultReadToken)(ownerId);
  return token ? { createdAt: token.createdAt } : null;
}

export type McpAccessTokenActionState = {
  token?: string;
  /** True once revokeMcpAccessToken has succeeded — distinguishes that from this state's initial
   * (also field-less) shape, so a client component can tell "revoked" from "never submitted". */
  revoked?: boolean;
  error?: LocalizedText;
};

export type GenerateMcpAccessTokenDeps = {
  getCurrentOwnerId?: () => Promise<string | null>;
  generateToken?: () => { token: string; tokenHash: string };
  now?: () => Date;
  saveToken?: (ownerId: string, tokenHash: string, createdAt: string) => Promise<void>;
};

/**
 * Generates a new MCP access token, replacing any existing one for the signed-in Owner (a second
 * call invalidates the first — one active token per Owner, ADR-0011). Returns the plaintext token
 * exactly once; only its hash is ever persisted. `(prevState, formData, deps)` — the same
 * `useActionState`-bindable shape as `confirmImportBatch` — though this form has no fields.
 */
export async function generateMcpAccessToken(
  _prevState: McpAccessTokenActionState,
  _formData: FormData,
  deps: GenerateMcpAccessTokenDeps = {}
): Promise<McpAccessTokenActionState> {
  const ownerId = await (deps.getCurrentOwnerId ?? getCurrentOwnerIdFn)();
  if (ownerId === null) {
    return { error: { key: "errors.mcpSignInGenerate" } };
  }

  const { token, tokenHash } = (deps.generateToken ?? generateToken)();
  const createdAt = (deps.now ?? (() => new Date()))().toISOString();
  await (deps.saveToken ?? defaultSaveToken)(ownerId, tokenHash, createdAt);

  return { token };
}

export type RevokeMcpAccessTokenDeps = {
  getCurrentOwnerId?: () => Promise<string | null>;
  revokeToken?: (ownerId: string) => Promise<void>;
};

export async function revokeMcpAccessToken(
  _prevState: McpAccessTokenActionState,
  _formData: FormData,
  deps: RevokeMcpAccessTokenDeps = {}
): Promise<McpAccessTokenActionState> {
  const ownerId = await (deps.getCurrentOwnerId ?? getCurrentOwnerIdFn)();
  if (ownerId === null) {
    return { error: { key: "errors.mcpSignInRevoke" } };
  }

  await (deps.revokeToken ?? defaultRevokeToken)(ownerId);
  return { revoked: true };
}
