import { randomUUID } from "node:crypto";

import { createClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import {
  requestPasswordReset,
  resetPassword,
  signIn,
  signInWithGoogle,
  signOut,
  signUp,
  type LoginFormState
} from "@/app/login/actions";

const SUPABASE_URL = process.env.TEST_SUPABASE_URL ?? "http://127.0.0.1:54321";
const SUPABASE_PUBLISHABLE_KEY =
  process.env.TEST_SUPABASE_PUBLISHABLE_KEY ?? "sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH";
const TEST_ORIGIN = "http://127.0.0.1:4571";

function formDataWith(fields: Record<string, string>): FormData {
  const formData = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    formData.set(key, value);
  }
  return formData;
}

describe("signUp", () => {
  it("rejects a password shorter than the minimum as a field error", async () => {
    const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
    const redirectTo = vi.fn();

    const result = await signUp(
      {} as LoginFormState,
      formDataWith({ email: `${randomUUID()}@example.com`, password: "123" }),
      { supabase, redirectTo, origin: TEST_ORIGIN }
    );

    expect(result.fieldErrors?.form).toBeTruthy();
    expect(redirectTo).not.toHaveBeenCalled();
  });

  it("rejects signing up twice with the same email", async () => {
    const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
    const redirectTo = vi.fn();
    const email = `${randomUUID()}@example.com`;
    const password = "correct horse battery staple 1!";

    const first = await signUp({} as LoginFormState, formDataWith({ email, password }), {
      supabase,
      redirectTo,
      origin: TEST_ORIGIN
    });
    expect(first.fieldErrors).toBeUndefined();

    const supabaseAgain = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
    const second = await signUp({} as LoginFormState, formDataWith({ email, password }), {
      supabase: supabaseAgain,
      redirectTo,
      origin: TEST_ORIGIN
    });

    expect(second.fieldErrors?.form).toBeTruthy();
  });

  it("persists a valid sign-up and redirects", async () => {
    const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
    const redirectTo = vi.fn();

    const result = await signUp(
      {} as LoginFormState,
      formDataWith({ email: `${randomUUID()}@example.com`, password: "correct horse battery staple 1!" }),
      { supabase, redirectTo, origin: TEST_ORIGIN }
    );

    expect(result).toEqual({});
    expect(redirectTo).toHaveBeenCalledWith("/?message=account_created");
  });

  it("points the confirmation email's redirect at /auth/callback on the given origin, so a " +
    "desktop user confirming from their local server lands back in that same instance", async () => {
    const redirectTo = vi.fn();
    const signUpMock = vi.fn().mockResolvedValue({ data: { session: null }, error: null });
    const supabase = { auth: { signUp: signUpMock } };
    const email = `${randomUUID()}@example.com`;

    await signUp({} as LoginFormState, formDataWith({ email, password: "correct horse battery staple 1!" }), {
      supabase: supabase as never,
      redirectTo,
      origin: "http://127.0.0.1:4571",
      locale: "en"
    });

    expect(signUpMock).toHaveBeenCalledWith({
      email,
      password: "correct horse battery staple 1!",
      options: { emailRedirectTo: "http://127.0.0.1:4571/auth/callback" }
    });
  });

  it("shows a system message instead of redirecting when sign-up succeeds but leaves no session " +
    "(email confirmation pending)", async () => {
    const redirectTo = vi.fn();
    const signUpMock = vi.fn().mockResolvedValue({ data: { session: null }, error: null });
    const supabase = { auth: { signUp: signUpMock } };
    const email = `${randomUUID()}@example.com`;

    const result = await signUp(
      {} as LoginFormState,
      formDataWith({ email, password: "correct horse battery staple 1!" }),
      { supabase: supabase as never, redirectTo, origin: TEST_ORIGIN, locale: "en" }
    );

    expect(redirectTo).not.toHaveBeenCalled();
    expect(result.fieldErrors).toBeUndefined();
    expect(result.message).toEqual({
      type: "success",
      text: "Account created. Check your email to confirm your account."
    });
  });

  it("redirects to / with an account_created message when sign-up succeeds and returns a session " +
    "(e.g. local dev with email confirmation disabled)", async () => {
    const redirectTo = vi.fn();
    const signUpMock = vi.fn().mockResolvedValue({ data: { session: { access_token: "t" } }, error: null });
    const supabase = { auth: { signUp: signUpMock } };
    const email = `${randomUUID()}@example.com`;

    const result = await signUp(
      {} as LoginFormState,
      formDataWith({ email, password: "correct horse battery staple 1!" }),
      { supabase: supabase as never, redirectTo, origin: TEST_ORIGIN }
    );

    expect(result).toEqual({});
    expect(redirectTo).toHaveBeenCalledWith("/?message=account_created");
  });

  it("syncs the owner_emails mapping when sign-up immediately returns a session", async () => {
    const redirectTo = vi.fn();
    const signUpMock = vi.fn().mockResolvedValue({
      data: { user: { id: "owner-1", email: "owner@example.com" }, session: { access_token: "t" } },
      error: null
    });
    const supabase = { auth: { signUp: signUpMock } };
    const syncOwnerEmail = vi.fn().mockResolvedValue(undefined);

    await signUp(
      {} as LoginFormState,
      formDataWith({ email: "owner@example.com", password: "correct horse battery staple 1!" }),
      { supabase: supabase as never, redirectTo, origin: TEST_ORIGIN, syncOwnerEmail }
    );

    expect(syncOwnerEmail).toHaveBeenCalledWith("owner-1", "owner@example.com");
  });
});

describe("signIn", () => {
  it("rejects an empty email without echoing the password in persisted state", async () => {
    const result = await signIn(
      {} as LoginFormState,
      formDataWith({ email: "", password: "secret-should-not-echo" })
    );

    expect(result.fieldErrors?.email).toEqual({ key: "errors.emailRequired" });
    expect(result.values?.email).toBe("");
    expect(result.values).not.toHaveProperty("password");
  });

  it("rejects the wrong password with a field error", async () => {
    const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
    const setupRedirectTo = vi.fn();
    const email = `${randomUUID()}@example.com`;

    await signUp({} as LoginFormState, formDataWith({ email, password: "correct horse battery staple 1!" }), {
      supabase,
      redirectTo: setupRedirectTo,
      origin: TEST_ORIGIN
    });

    const signInSupabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
    const redirectTo = vi.fn();
    const result = await signIn({} as LoginFormState, formDataWith({ email, password: "wrong password" }), {
      supabase: signInSupabase,
      redirectTo
    });

    expect(result.fieldErrors?.form).toBeTruthy();
    expect(redirectTo).not.toHaveBeenCalled();
  });

  it("signs in with the correct password and redirects", async () => {
    const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
    const setupRedirectTo = vi.fn();
    const email = `${randomUUID()}@example.com`;
    const password = "correct horse battery staple 1!";

    await signUp({} as LoginFormState, formDataWith({ email, password }), {
      supabase,
      redirectTo: setupRedirectTo,
      origin: TEST_ORIGIN
    });

    const signInSupabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
    const redirectTo = vi.fn();
    const result = await signIn({} as LoginFormState, formDataWith({ email, password }), {
      supabase: signInSupabase,
      redirectTo
    });

    expect(result).toEqual({});
    expect(redirectTo).toHaveBeenCalledOnce();
    expect(redirectTo).toHaveBeenCalledWith("/");
  });

  it("syncs the owner_emails mapping after a successful sign-in", async () => {
    const redirectTo = vi.fn();
    const signInWithPassword = vi.fn().mockResolvedValue({
      data: { user: { id: "owner-1", email: "owner@example.com" } },
      error: null
    });
    const supabase = { auth: { signInWithPassword } };
    const syncOwnerEmail = vi.fn().mockResolvedValue(undefined);

    await signIn(
      {} as LoginFormState,
      formDataWith({ email: "owner@example.com", password: "correct horse battery staple 1!" }),
      { supabase: supabase as never, redirectTo, syncOwnerEmail }
    );

    expect(syncOwnerEmail).toHaveBeenCalledWith("owner-1", "owner@example.com");
    expect(redirectTo).toHaveBeenCalledWith("/");
  });

  it("still redirects after sign-in when the owner_emails sync write rejects", async () => {
    const redirectTo = vi.fn();
    const signInWithPassword = vi.fn().mockResolvedValue({
      data: { user: { id: "owner-1", email: "owner@example.com" } },
      error: null
    });
    const supabase = { auth: { signInWithPassword } };
    const syncOwnerEmail = vi.fn().mockRejectedValue(new Error("connection refused"));

    const result = await signIn(
      {} as LoginFormState,
      formDataWith({ email: "owner@example.com", password: "correct horse battery staple 1!" }),
      { supabase: supabase as never, redirectTo, syncOwnerEmail }
    );

    expect(result).toEqual({});
    expect(redirectTo).toHaveBeenCalledWith("/");
  });
});

describe("requestPasswordReset", () => {
  it("rejects an empty email as a field error, without calling Supabase", async () => {
    const resetPasswordForEmail = vi.fn();
    const supabase = { auth: { resetPasswordForEmail } };

    const result = await requestPasswordReset({} as LoginFormState, formDataWith({ email: "" }), {
      supabase: supabase as never
    });

    expect(result.fieldErrors?.email).toEqual({ key: "errors.emailRequired" });
    expect(resetPasswordForEmail).not.toHaveBeenCalled();
  });

  it("points the reset email's redirect at /auth/callback?next=/login/reset-password on the given origin", async () => {
    const resetPasswordForEmail = vi.fn().mockResolvedValue({ data: {}, error: null });
    const supabase = { auth: { resetPasswordForEmail } };
    const email = `${randomUUID()}@example.com`;

    await requestPasswordReset({} as LoginFormState, formDataWith({ email }), {
      supabase: supabase as never,
      origin: "http://127.0.0.1:4571",
      locale: "en"
    });

    expect(resetPasswordForEmail).toHaveBeenCalledWith(email, {
      redirectTo: "http://127.0.0.1:4571/auth/callback?next=/login/reset-password"
    });
  });

  it("shows a generic success message once the reset email is requested", async () => {
    const resetPasswordForEmail = vi.fn().mockResolvedValue({ data: {}, error: null });
    const supabase = { auth: { resetPasswordForEmail } };

    const result = await requestPasswordReset(
      {} as LoginFormState,
      formDataWith({ email: `${randomUUID()}@example.com` }),
      { supabase: supabase as never, origin: "http://127.0.0.1:4571", locale: "en" }
    );

    expect(result.fieldErrors).toBeUndefined();
    expect(result.message).toEqual({
      type: "success",
      text: "If an account exists for that email, a password reset link has been sent."
    });
  });

  it("shows the same generic success message even for an email that has never signed up", async () => {
    const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

    const result = await requestPasswordReset(
      {} as LoginFormState,
      formDataWith({ email: `${randomUUID()}@example.com` }),
      { supabase, origin: TEST_ORIGIN, locale: "en" }
    );

    expect(result.fieldErrors).toBeUndefined();
    expect(result.message?.type).toBe("success");
  });

  it("surfaces a Supabase error as a form field error, without a success message", async () => {
    const resetPasswordForEmail = vi.fn().mockResolvedValue({
      data: null,
      error: new Error("email rate limit exceeded")
    });
    const supabase = { auth: { resetPasswordForEmail } };

    const result = await requestPasswordReset(
      {} as LoginFormState,
      formDataWith({ email: `${randomUUID()}@example.com` }),
      { supabase: supabase as never, origin: "http://127.0.0.1:4571", locale: "en" }
    );

    expect(result.fieldErrors?.form).toBeTruthy();
    expect(result.message).toBeUndefined();
  });
});

describe("resetPassword", () => {
  it("rejects an empty password as a field error, without calling Supabase", async () => {
    const updateUser = vi.fn();
    const supabase = { auth: { updateUser } };

    const result = await resetPassword(
      {} as LoginFormState,
      formDataWith({ password: "", confirmPassword: "" }),
      { supabase: supabase as never }
    );

    expect(result.fieldErrors?.password).toEqual({ key: "errors.passwordRequired" });
    expect(updateUser).not.toHaveBeenCalled();
  });

  it("rejects an empty confirm-password as a field error, without calling Supabase", async () => {
    const updateUser = vi.fn();
    const supabase = { auth: { updateUser } };

    const result = await resetPassword(
      {} as LoginFormState,
      formDataWith({ password: "correct horse battery staple 1!", confirmPassword: "" }),
      { supabase: supabase as never }
    );

    expect(result.fieldErrors?.confirmPassword).toEqual({ key: "errors.passwordRequired" });
    expect(updateUser).not.toHaveBeenCalled();
  });

  it("rejects mismatched passwords as a field error on confirmPassword, without calling Supabase", async () => {
    const updateUser = vi.fn();
    const supabase = { auth: { updateUser } };

    const result = await resetPassword(
      {} as LoginFormState,
      formDataWith({ password: "correct horse battery staple 1!", confirmPassword: "something else" }),
      { supabase: supabase as never }
    );

    expect(result.fieldErrors?.confirmPassword).toEqual({ key: "errors.passwordMismatch" });
    expect(updateUser).not.toHaveBeenCalled();
  });

  it("never echoes password or confirmPassword back into persisted state", async () => {
    const result = await resetPassword(
      {} as LoginFormState,
      formDataWith({ password: "correct horse battery staple 1!", confirmPassword: "something else" })
    );

    expect(result.values).not.toHaveProperty("password");
    expect(result.values).not.toHaveProperty("confirmPassword");
  });

  it("shows a friendly expired-link message when there's no recovery session, instead of a raw Supabase error", async () => {
    const updateUser = vi.fn().mockResolvedValue({
      data: { user: null },
      error: { name: "AuthSessionMissingError", message: "Auth session missing!" }
    });
    const supabase = { auth: { updateUser } };
    const redirectTo = vi.fn();

    const result = await resetPassword(
      {} as LoginFormState,
      formDataWith({ password: "correct horse battery staple 1!", confirmPassword: "correct horse battery staple 1!" }),
      { supabase: supabase as never, redirectTo }
    );

    expect(result.fieldErrors?.form).toEqual({ key: "errors.resetLinkExpired" });
    expect(redirectTo).not.toHaveBeenCalled();
  });

  it("surfaces a Supabase rejection (password too short) as a form field error, without redirecting", async () => {
    const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
    const setupRedirectTo = vi.fn();
    const email = `${randomUUID()}@example.com`;

    await signUp({} as LoginFormState, formDataWith({ email, password: "correct horse battery staple 1!" }), {
      supabase,
      redirectTo: setupRedirectTo,
      origin: TEST_ORIGIN
    });

    const redirectTo = vi.fn();
    const result = await resetPassword(
      {} as LoginFormState,
      formDataWith({ password: "123", confirmPassword: "123" }),
      { supabase, redirectTo }
    );

    expect(result.fieldErrors?.form).toBeTruthy();
    expect(redirectTo).not.toHaveBeenCalled();
  });

  it("updates the password, signs out, and redirects to /login with a success message", async () => {
    const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
    const setupRedirectTo = vi.fn();
    const email = `${randomUUID()}@example.com`;

    await signUp({} as LoginFormState, formDataWith({ email, password: "correct horse battery staple 1!" }), {
      supabase,
      redirectTo: setupRedirectTo,
      origin: TEST_ORIGIN
    });

    const redirectTo = vi.fn();
    const result = await resetPassword(
      {} as LoginFormState,
      formDataWith({ password: "a new correct horse battery staple 2!", confirmPassword: "a new correct horse battery staple 2!" }),
      { supabase, redirectTo }
    );

    expect(result).toEqual({});
    expect(redirectTo).toHaveBeenCalledWith("/login?message=password_reset");

    const { data } = await supabase.auth.getClaims();
    expect(data).toBeNull();
  });
});

describe("signInWithGoogle", () => {
  it("starts the OAuth flow and redirects to the provider's consent URL", async () => {
    const redirectTo = vi.fn();
    const signInWithOAuth = vi.fn().mockResolvedValue({
      data: { url: "https://accounts.google.com/o/oauth2/v2/auth?client_id=..." },
      error: null
    });
    const supabase = { auth: { signInWithOAuth } };

    await signInWithGoogle(new FormData(), {
      supabase: supabase as never,
      redirectTo,
      origin: "http://localhost:3000"
    });

    expect(signInWithOAuth).toHaveBeenCalledWith({
      provider: "google",
      options: { redirectTo: "http://localhost:3000/auth/callback" }
    });
    expect(redirectTo).toHaveBeenCalledWith("https://accounts.google.com/o/oauth2/v2/auth?client_id=...");
  });

  it("throws when Supabase fails to start the flow, without redirecting", async () => {
    const redirectTo = vi.fn();
    const signInWithOAuth = vi.fn().mockResolvedValue({
      data: { url: null },
      error: new Error("provider not configured")
    });
    const supabase = { auth: { signInWithOAuth } };

    await expect(
      signInWithGoogle(new FormData(), {
        supabase: supabase as never,
        redirectTo,
        origin: "http://localhost:3000"
      })
    ).rejects.toThrow("provider not configured");

    expect(redirectTo).not.toHaveBeenCalled();
  });
});

describe("signOut", () => {
  it("signs the user out and redirects to /login", async () => {
    const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
    const setupRedirectTo = vi.fn();
    const email = `${randomUUID()}@example.com`;
    const password = "correct horse battery staple 1!";

    await signUp({} as LoginFormState, formDataWith({ email, password }), {
      supabase,
      redirectTo: setupRedirectTo,
      origin: TEST_ORIGIN
    });

    const redirectTo = vi.fn();
    await signOut(new FormData(), { supabase, redirectTo });

    expect(redirectTo).toHaveBeenCalledWith("/login");

    const { data } = await supabase.auth.getClaims();
    expect(data).toBeNull();
  });
});
