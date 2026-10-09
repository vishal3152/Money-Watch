"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { withPersistedFormState } from "@/app/form-persistence";
import type { LoginFormState } from "@/app/login/actions";
import { SIMPLE_SESSION_COOKIE, createSessionToken, verifyCredentials } from "@/lib/simple-auth/session";

export type SimpleLoginActionDeps = {
  redirectTo?: (path: string) => void;
  setCookie?: (name: string, value: string) => void;
  clearCookie?: (name: string) => void;
};

function withSimpleLoginFormState(formData: FormData, state: LoginFormState): LoginFormState {
  return withPersistedFormState(formData, state, { omitKeys: ["password"] });
}

async function setSessionCookie(token: string, deps: SimpleLoginActionDeps): Promise<void> {
  if (deps.setCookie) {
    deps.setCookie(SIMPLE_SESSION_COOKIE, token);
    return;
  }

  (await cookies()).set(SIMPLE_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/"
  });
}

async function deleteSessionCookie(deps: SimpleLoginActionDeps): Promise<void> {
  if (deps.clearCookie) {
    deps.clearCookie(SIMPLE_SESSION_COOKIE);
    return;
  }

  (await cookies()).delete(SIMPLE_SESSION_COOKIE);
}

export async function simpleSignIn(
  _prevState: LoginFormState,
  formData: FormData,
  deps: SimpleLoginActionDeps = {}
): Promise<LoginFormState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (email.length === 0) {
    return withSimpleLoginFormState(formData, {
      fieldErrors: { email: { key: "errors.emailRequired" } }
    });
  }

  if (password.length === 0) {
    return withSimpleLoginFormState(formData, {
      fieldErrors: { password: { key: "errors.passwordRequired" } }
    });
  }

  // One generic error for both "unknown email" and "wrong password" — a
  // per-field error would let a caller enumerate which emails are configured.
  if (!verifyCredentials(email, password)) {
    return withSimpleLoginFormState(formData, {
      fieldErrors: { form: { key: "errors.invalidCredentials" } }
    });
  }

  await setSessionCookie(await createSessionToken(email, password), deps);

  const redirectTo = deps.redirectTo ?? redirect;
  redirectTo("/");

  return {};
}

export async function simpleSignOut(
  _formData: FormData,
  deps: SimpleLoginActionDeps = {}
): Promise<void> {
  await deleteSessionCookie(deps);

  const redirectTo = deps.redirectTo ?? redirect;
  redirectTo("/login");
}
