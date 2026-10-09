import { hashMcpAccessToken } from "@/domain/mcp-access-token";

const BEARER_SCHEME = "bearer";

export type ResolveOwnerIdFromAuthHeaderDeps = {
  resolveOwnerIdByTokenHash: (tokenHash: string) => Promise<string | null>;
};

/**
 * Cloud mode's counterpart to `isLoopbackHost()`: a real hosted deployment has no "same machine"
 * to trust, so a request must instead present the Owner's MCP access token (ADR-0011). Returns
 * null for a missing/malformed header or a token matching no Owner — callers must treat both the
 * same way (401), never distinguishing "no token" from "wrong token".
 */
export async function resolveOwnerIdFromAuthHeader(
  authorizationHeader: string | null,
  deps: ResolveOwnerIdFromAuthHeaderDeps
): Promise<string | null> {
  if (authorizationHeader === null) {
    return null;
  }

  // RFC 7235: the auth-scheme token ("Bearer") is case-insensitive, unlike the token that follows it.
  const spaceIndex = authorizationHeader.indexOf(" ");
  if (spaceIndex === -1 || authorizationHeader.slice(0, spaceIndex).toLowerCase() !== BEARER_SCHEME) {
    return null;
  }

  const token = authorizationHeader.slice(spaceIndex + 1).trim();
  if (token.length === 0) {
    return null;
  }

  return deps.resolveOwnerIdByTokenHash(hashMcpAccessToken(token));
}
