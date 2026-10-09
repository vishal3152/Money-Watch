/**
 * The MCP import server (`docs/specs/import.md`) is mounted on this same Next.js
 * server. The Settings screen shows its address built from the current request's
 * own Host + protocol, rather than a guessed/hardcoded port or scheme, so it's
 * always right for however this instance is actually being reached (a fixed
 * Electron port, a Docker/NAS deployment's own port, or a cloud https domain).
 */

export type McpRequestHeaderBag = Record<string, string | null | undefined>;

/** Prefer `x-forwarded-proto` (Vercel / reverse proxies); default to http for local/desktop. */
export function resolveMcpRequestProtocol(headers: McpRequestHeaderBag): "http" | "https" {
  const raw = headers["x-forwarded-proto"];
  if (!raw) {
    return "http";
  }
  const first = raw.split(",")[0]?.trim().toLowerCase();
  return first === "https" ? "https" : "http";
}

export function resolveMcpEndpointUrl(
  host: string | null,
  protocol: "http" | "https" = "http"
): string {
  return `${protocol}://${host ?? "localhost"}/api/mcp`;
}

/**
 * Cursor / Claude Code `mcp.json` snippet for the Settings copy-paste block.
 * Cloud mode includes `headers.Authorization` when a plaintext token is in hand;
 * local/desktop omits headers entirely.
 */
export function buildMcpClientConfigJson(input: {
  url: string;
  accessToken?: string;
}): string {
  const server: {
    type: "http";
    url: string;
    headers?: { Authorization: string };
  } = {
    type: "http",
    url: input.url
  };
  if (input.accessToken !== undefined) {
    server.headers = { Authorization: `Bearer ${input.accessToken}` };
  }
  return JSON.stringify({ mcpServers: { "paisa-watch": server } }, null, 2);
}
