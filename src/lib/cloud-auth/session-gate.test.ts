import { describe, expect, it } from "vitest";

import { shouldRedirectToLogin } from "@/lib/cloud-auth/session-gate";

describe("shouldRedirectToLogin", () => {
  it("never redirects in local mode, regardless of session or path", () => {
    expect(
      shouldRedirectToLogin({ isCloudMode: false, hasSession: false, pathname: "/" })
    ).toBe(false);
  });

  it("redirects in cloud mode with no session on a protected path", () => {
    expect(
      shouldRedirectToLogin({ isCloudMode: true, hasSession: false, pathname: "/" })
    ).toBe(true);
  });

  it("does not redirect in cloud mode with no session when already on /login", () => {
    expect(
      shouldRedirectToLogin({ isCloudMode: true, hasSession: false, pathname: "/login" })
    ).toBe(false);
  });

  it("does not redirect in cloud mode with no session on the OAuth callback route", () => {
    expect(
      shouldRedirectToLogin({ isCloudMode: true, hasSession: false, pathname: "/auth/callback" })
    ).toBe(false);
  });

  it("redirects in cloud mode with no session on /settings, since it now renders real " +
    "owner-scoped data (Email Alert Sync)", () => {
    expect(
      shouldRedirectToLogin({ isCloudMode: true, hasSession: false, pathname: "/settings" })
    ).toBe(true);
  });

  it("does not redirect in cloud mode with no session on /api/mcp, since it authenticates " +
    "itself via a bearer token (ADR-0011), not the session cookie — an MCP client has no " +
    "session cookie, so gating it here would redirect every request to an HTML /login page", () => {
    expect(
      shouldRedirectToLogin({ isCloudMode: true, hasSession: false, pathname: "/api/mcp" })
    ).toBe(false);
  });

  it("does not redirect in cloud mode with no session on /api/cron/email-sync, since it " +
    "authenticates itself via CRON_SECRET, not the session cookie — Vercel Cron has no " +
    "session cookie, so gating it here would redirect every scheduled run to an HTML /login page", () => {
    expect(
      shouldRedirectToLogin({ isCloudMode: true, hasSession: false, pathname: "/api/cron/email-sync" })
    ).toBe(false);
  });

  it("does not redirect in cloud mode once a session exists", () => {
    expect(
      shouldRedirectToLogin({ isCloudMode: true, hasSession: true, pathname: "/" })
    ).toBe(false);
  });
});
