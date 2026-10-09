import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import { handleAuthCallback } from "@/app/auth/callback/handle-callback";

function fakeSupabase(exchangeCodeForSession: SupabaseClient["auth"]["exchangeCodeForSession"]) {
  return { auth: { exchangeCodeForSession } } as Pick<SupabaseClient, "auth">;
}

describe("handleAuthCallback", () => {
  it("redirects to / after successfully exchanging a code for a session", async () => {
    const exchangeCodeForSession = vi.fn().mockResolvedValue({ data: { user: null }, error: null });

    const destination = await handleAuthCallback({
      code: "a-real-auth-code",
      origin: "http://localhost:3000",
      supabase: fakeSupabase(exchangeCodeForSession)
    });

    expect(exchangeCodeForSession).toHaveBeenCalledWith("a-real-auth-code");
    expect(destination).toBe("http://localhost:3000/");
  });

  it("syncs the owner_emails mapping for the session's user before redirecting", async () => {
    const exchangeCodeForSession = vi.fn().mockResolvedValue({
      data: { user: { id: "owner-1", email: "owner@example.com" } },
      error: null
    });
    const syncOwnerEmail = vi.fn().mockResolvedValue(undefined);

    const destination = await handleAuthCallback({
      code: "a-real-auth-code",
      origin: "http://localhost:3000",
      supabase: fakeSupabase(exchangeCodeForSession),
      syncOwnerEmail
    });

    expect(syncOwnerEmail).toHaveBeenCalledWith("owner-1", "owner@example.com");
    expect(destination).toBe("http://localhost:3000/");
  });

  it("still redirects to / when the owner_emails sync write rejects", async () => {
    const exchangeCodeForSession = vi.fn().mockResolvedValue({
      data: { user: { id: "owner-1", email: "owner@example.com" } },
      error: null
    });
    const syncOwnerEmail = vi.fn().mockRejectedValue(new Error("connection refused"));

    const destination = await handleAuthCallback({
      code: "a-real-auth-code",
      origin: "http://localhost:3000",
      supabase: fakeSupabase(exchangeCodeForSession),
      syncOwnerEmail
    });

    expect(destination).toBe("http://localhost:3000/");
  });

  it("redirects to the given next path after successfully exchanging a code for a session", async () => {
    const exchangeCodeForSession = vi.fn().mockResolvedValue({ data: { user: null }, error: null });

    const destination = await handleAuthCallback({
      code: "a-real-auth-code",
      origin: "http://localhost:3000",
      next: "/login/reset-password",
      supabase: fakeSupabase(exchangeCodeForSession)
    });

    expect(destination).toBe("http://localhost:3000/login/reset-password");
  });

  it("ignores an absolute or protocol-relative next value rather than redirecting off-origin", async () => {
    const exchangeCodeForSession = vi.fn().mockResolvedValue({ data: { user: null }, error: null });

    const destination = await handleAuthCallback({
      code: "a-real-auth-code",
      origin: "http://localhost:3000",
      next: "https://evil.example/",
      supabase: fakeSupabase(exchangeCodeForSession)
    });

    expect(destination).toBe("http://localhost:3000/");
  });

  it("redirects to /login with a sign_in_cancelled message when there is no code (e.g. the user cancelled)", async () => {
    const exchangeCodeForSession = vi.fn();

    const destination = await handleAuthCallback({
      code: null,
      origin: "http://localhost:3000",
      supabase: fakeSupabase(exchangeCodeForSession)
    });

    expect(exchangeCodeForSession).not.toHaveBeenCalled();
    expect(destination).toBe("http://localhost:3000/login?error=sign_in_cancelled");
  });

  it("redirects to /login with a link_expired message when exchanging the code fails", async () => {
    const exchangeCodeForSession = vi.fn().mockResolvedValue({ error: new Error("invalid code") });

    const destination = await handleAuthCallback({
      code: "a-bad-code",
      origin: "http://localhost:3000",
      supabase: fakeSupabase(exchangeCodeForSession)
    });

    expect(destination).toBe("http://localhost:3000/login?error=link_expired");
  });
});
