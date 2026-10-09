// /api/mcp and /api/cron/email-sync are not session-cookie-gated: each authenticates itself
// (a bearer MCP access token per ADR-0011, or CRON_SECRET for the Vercel Cron trigger). Neither
// caller has a browser session cookie, so gating them here would redirect every request/scheduled
// run to an HTML /login page before the route's own auth ever ran.
const PUBLIC_PATHS = ["/login", "/auth/callback", "/api/mcp", "/api/cron/email-sync"];

export type SessionGateParams = {
  isCloudMode: boolean;
  hasSession: boolean;
  pathname: string;
};

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

/** Cloud mode with no session must redirect to /login rather than let a page's
 * repository factory throw DatabaseConfigurationError (a 500). Local mode never
 * redirects — it never has a session to check. */
export function shouldRedirectToLogin({ isCloudMode, hasSession, pathname }: SessionGateParams): boolean {
  if (!isCloudMode || hasSession) {
    return false;
  }

  return !isPublicPath(pathname);
}
