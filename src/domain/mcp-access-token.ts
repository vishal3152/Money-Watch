import { createHash, randomBytes } from "node:crypto";

/**
 * A generated MCP access token: the plaintext to show the Owner exactly once, and its hash for
 * storage. Only `tokenHash` is ever persisted (docs/adr/0011-mcp-cloud-auth-static-bearer-token.md) —
 * the plaintext must never reach a database row, log line, or error message.
 */
export type GeneratedMcpAccessToken = {
  token: string;
  tokenHash: string;
};

export type GenerateMcpAccessTokenDeps = {
  randomToken?: () => string;
};

export function generateMcpAccessToken(deps: GenerateMcpAccessTokenDeps = {}): GeneratedMcpAccessToken {
  const token = (deps.randomToken ?? (() => randomBytes(32).toString("hex")))();
  return { token, tokenHash: hashMcpAccessToken(token) };
}

export function hashMcpAccessToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
