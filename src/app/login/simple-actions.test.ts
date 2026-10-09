import { afterEach, describe, expect, it, vi } from "vitest";

import { simpleSignIn, simpleSignOut } from "@/app/login/simple-actions";
import type { LoginFormState } from "@/app/login/actions";
import { SIMPLE_SESSION_COOKIE } from "@/lib/simple-auth/session";

const ORIGINAL_AUTH_USERS = process.env.AUTH_USERS;

function formDataWith(fields: Record<string, string>): FormData {
  const formData = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    formData.set(key, value);
  }
  return formData;
}

afterEach(() => {
  if (ORIGINAL_AUTH_USERS === undefined) {
    delete process.env.AUTH_USERS;
  } else {
    process.env.AUTH_USERS = ORIGINAL_AUTH_USERS;
  }
});

describe("simpleSignIn", () => {
  it("rejects an empty email as a field error", async () => {
    process.env.AUTH_USERS = "alice@example.com:correct horse battery staple";
    const redirectTo = vi.fn();
    const setCookie = vi.fn();

    const result = await simpleSignIn(
      {} as LoginFormState,
      formDataWith({ email: "", password: "correct horse battery staple" }),
      { redirectTo, setCookie }
    );

    expect(result.fieldErrors?.email).toBeTruthy();
    expect(setCookie).not.toHaveBeenCalled();
    expect(redirectTo).not.toHaveBeenCalled();
  });

  it("rejects an empty password as a field error", async () => {
    process.env.AUTH_USERS = "alice@example.com:correct horse battery staple";
    const redirectTo = vi.fn();
    const setCookie = vi.fn();

    const result = await simpleSignIn(
      {} as LoginFormState,
      formDataWith({ email: "alice@example.com", password: "" }),
      { redirectTo, setCookie }
    );

    expect(result.fieldErrors?.password).toBeTruthy();
    expect(setCookie).not.toHaveBeenCalled();
    expect(redirectTo).not.toHaveBeenCalled();
  });

  it("rejects a wrong password as a form error, without setting a cookie", async () => {
    process.env.AUTH_USERS = "alice@example.com:correct horse battery staple";
    const redirectTo = vi.fn();
    const setCookie = vi.fn();

    const result = await simpleSignIn(
      {} as LoginFormState,
      formDataWith({ email: "alice@example.com", password: "wrong password" }),
      { redirectTo, setCookie }
    );

    expect(result.fieldErrors?.form).toBeTruthy();
    expect(setCookie).not.toHaveBeenCalled();
    expect(redirectTo).not.toHaveBeenCalled();
  });

  it("rejects an email that isn't configured, as the same generic form error (no user enumeration)", async () => {
    process.env.AUTH_USERS = "alice@example.com:correct horse battery staple";
    const redirectTo = vi.fn();
    const setCookie = vi.fn();

    const result = await simpleSignIn(
      {} as LoginFormState,
      formDataWith({ email: "mallory@example.com", password: "correct horse battery staple" }),
      { redirectTo, setCookie }
    );

    expect(result.fieldErrors?.form).toBeTruthy();
    expect(setCookie).not.toHaveBeenCalled();
    expect(redirectTo).not.toHaveBeenCalled();
  });

  it("rejects one user's password paired with a different user's email", async () => {
    process.env.AUTH_USERS = "alice@example.com:hunter2,bob@example.com:hunter3";
    const redirectTo = vi.fn();
    const setCookie = vi.fn();

    const result = await simpleSignIn(
      {} as LoginFormState,
      formDataWith({ email: "bob@example.com", password: "hunter2" }),
      { redirectTo, setCookie }
    );

    expect(result.fieldErrors?.form).toBeTruthy();
    expect(setCookie).not.toHaveBeenCalled();
    expect(redirectTo).not.toHaveBeenCalled();
  });

  it("sets the session cookie and redirects home on correct email and password", async () => {
    process.env.AUTH_USERS = "alice@example.com:correct horse battery staple";
    const redirectTo = vi.fn();
    const setCookie = vi.fn();

    const result = await simpleSignIn(
      {} as LoginFormState,
      formDataWith({ email: "alice@example.com", password: "correct horse battery staple" }),
      { redirectTo, setCookie }
    );

    expect(result).toEqual({});
    expect(setCookie).toHaveBeenCalledWith(SIMPLE_SESSION_COOKIE, expect.any(String));
    expect(redirectTo).toHaveBeenCalledWith("/");
  });

  it("never echoes the submitted password back into form state", async () => {
    process.env.AUTH_USERS = "alice@example.com:correct horse battery staple";

    const result = await simpleSignIn(
      {} as LoginFormState,
      formDataWith({ email: "alice@example.com", password: "wrong password" }),
      { redirectTo: vi.fn(), setCookie: vi.fn() }
    );

    expect(result.values?.password).toBeUndefined();
  });

  it("persists the submitted email on error, for redisplay", async () => {
    process.env.AUTH_USERS = "alice@example.com:correct horse battery staple";

    const result = await simpleSignIn(
      {} as LoginFormState,
      formDataWith({ email: "alice@example.com", password: "wrong password" }),
      { redirectTo: vi.fn(), setCookie: vi.fn() }
    );

    expect(result.values?.email).toBe("alice@example.com");
  });
});

describe("simpleSignOut", () => {
  it("clears the session cookie and redirects to /login", async () => {
    const redirectTo = vi.fn();
    const clearCookie = vi.fn();

    await simpleSignOut(new FormData(), { redirectTo, clearCookie });

    expect(clearCookie).toHaveBeenCalledWith(SIMPLE_SESSION_COOKIE);
    expect(redirectTo).toHaveBeenCalledWith("/login");
  });
});
