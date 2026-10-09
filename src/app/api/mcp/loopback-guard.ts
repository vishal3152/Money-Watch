function isLoopbackHostname(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}

/**
 * DNS-rebinding guard: the MCP endpoint writes Transactions and is meant to be reachable only
 * from the owner's own machine. Binding to 127.0.0.1 (the Electron shell already does this)
 * isn't enough on its own — a page in the owner's browser could still same-origin POST here if
 * an attacker-controlled domain is rebound to resolve to 127.0.0.1. The SDK's own `allowedHosts`
 * option is marked deprecated in favor of exactly this: external Host-header validation.
 */
export function isLoopbackHost(hostHeader: string | null): boolean {
  if (!hostHeader) {
    return false;
  }
  const hostname = hostHeader.startsWith("[")
    ? hostHeader.slice(0, hostHeader.indexOf("]") + 1)
    : (hostHeader.split(":")[0] ?? "");
  return isLoopbackHostname(hostname);
}

/**
 * Defense-in-depth alongside `isLoopbackHost`: rejects a request whose `Origin` header names a
 * non-loopback page (a browser tab on some other site attempting a cross-origin POST here). A
 * missing `Origin` — every non-browser MCP client (a local stdio bridge, `curl`, most desktop MCP
 * clients) never sends one — is allowed, since Host-header validation is already this endpoint's
 * primary guard; this only tightens the one case a same-origin browser POST could otherwise slip
 * through with a spoofed/rebound Host.
 */
export function isAllowedOrigin(originHeader: string | null): boolean {
  if (!originHeader) {
    return true;
  }
  try {
    return isLoopbackHostname(new URL(originHeader).hostname);
  } catch {
    // An unparseable Origin (e.g. the opaque "null" a sandboxed iframe sends) is never a loopback
    // page — reject rather than guess.
    return false;
  }
}
