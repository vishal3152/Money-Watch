"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { withPersistedFormState } from "@/app/form-persistence";
import { resolveSystemMessage, type SystemMessage } from "@/app/components/system-message";
import { syncOwnerEmailBestEffort, type SyncOwnerEmail } from "@/app/login/sync-owner-email";
import { domainErrorText } from "@/app/domain-error-text";
import { getAuthProvider } from "@/config/auth-provider";
import { getTranslator } from "@/i18n/server";
import type { Locale } from "@/i18n/locales";
import type { LocalizedText } from "@/i18n/translator";

export type LoginFormState = {
  fieldErrors?: {
    email?: LocalizedText;
    password?: LocalizedText;
    confirmPassword?: LocalizedText;
    form?: LocalizedText;
  };
  message?: SystemMessage;
  values?: Record<string, string>;
  formKey?: string;
};

export type LoginActionDeps = {
  supabase?: Pick<SupabaseClient, "auth">;
  redirectTo?: (path: string) => void;
  origin?: string;
  locale?: Locale;
  syncOwnerEmail?: SyncOwnerEmail;
};

function readCredentials(formData: FormData): { email: string; password: string } {
  return {
    email: String(formData.get("email") ?? "").trim(),
    password: String(formData.get("password") ?? "")
  };
}

function missingFieldError(email: string, password: string): LoginFormState["fieldErrors"] | null {
  if (email.length === 0) {
    return { email: { key: "errors.emailRequired" } };
  }
  if (password.length === 0) {
    return { password: { key: "errors.passwordRequired" } };
  }
  return null;
}

/** Persist email for redisplay; never echo password back into action state. */
function withLoginFormState(formData: FormData, state: LoginFormState): LoginFormState {
  const persisted = withPersistedFormState(formData, state);
  const { password: _password, ...safeValues } = persisted.values;
  return { ...persisted, values: safeValues };
}

// Dynamically imported so local/desktop never evaluates the Supabase SDK, matching
// every other Supabase entry point (middleware.ts, current-owner.ts, auth/callback/route.ts)
// rather than relying on callers to keep this module itself unreachable there.
async function resolveSupabase(deps: LoginActionDeps): Promise<Pick<SupabaseClient, "auth">> {
  if (deps.supabase) {
    return deps.supabase;
  }

  const { createSupabaseServerClient } = await import("@/lib/supabase/server");
  return createSupabaseServerClient();
}

export async function signUp(
  _prevState: LoginFormState,
  formData: FormData,
  deps: LoginActionDeps = {}
): Promise<LoginFormState> {
  const { email, password } = readCredentials(formData);

  const fieldErrors = missingFieldError(email, password);
  if (fieldErrors) {
    return withLoginFormState(formData, { fieldErrors });
  }

  const supabase = await resolveSupabase(deps);
  const origin = deps.origin ?? (await headers()).get("origin") ?? "";
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: `${origin}/auth/callback` }
  });

  if (error) {
    return withLoginFormState(formData, { fieldErrors: { form: domainErrorText(error) } });
  }

  // No session means email confirmation is pending (Supabase doesn't sign the
  // user in yet) — nothing to redirect to, so tell them here instead.
  if (!data.session) {
    const { t } = await getTranslator(deps.locale);
    return withLoginFormState(formData, { message: resolveSystemMessage("account_created", t) });
  }

  await syncOwnerEmailBestEffort(data.user?.id, data.user?.email, deps.syncOwnerEmail);

  const redirectTo = deps.redirectTo ?? redirect;
  redirectTo("/?message=account_created");

  return {};
}

export async function requestPasswordReset(
  _prevState: LoginFormState,
  formData: FormData,
  deps: LoginActionDeps = {}
): Promise<LoginFormState> {
  const email = String(formData.get("email") ?? "").trim();

  if (email.length === 0) {
    return withLoginFormState(formData, { fieldErrors: { email: { key: "errors.emailRequired" } } });
  }

  const supabase = await resolveSupabase(deps);
  const origin = deps.origin ?? (await headers()).get("origin") ?? "";
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/callback?next=/login/reset-password`
  });

  if (error) {
    return withLoginFormState(formData, { fieldErrors: { form: domainErrorText(error) } });
  }

  // Supabase's own API never reveals whether the email is registered — this
  // message is shown for both cases, matching that by construction rather
  // than adding an enumeration leak on top of it.
  const { t } = await getTranslator(deps.locale);
  return withLoginFormState(formData, { message: resolveSystemMessage("password_reset_requested", t) });
}

/**
 * Starts the Google OAuth flow: asks Supabase for the provider's consent-screen
 * URL and sends the browser there. There is no field state to return — a
 * failure here means Google/Supabase itself is misconfigured, not a bad
 * input, so it throws rather than surfacing a form field error.
 */
export async function signInWithGoogle(
  _formData: FormData,
  deps: LoginActionDeps = {}
): Promise<void> {
  const supabase = await resolveSupabase(deps);
  const origin = deps.origin ?? (await headers()).get("origin") ?? "";

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${origin}/auth/callback` }
  });

  if (error || !data?.url) {
    throw error ?? new Error("Failed to start Google sign-in.");
  }

  const redirectTo = deps.redirectTo ?? redirect;
  redirectTo(data.url);
}

export async function signIn(
  _prevState: LoginFormState,
  formData: FormData,
  deps: LoginActionDeps = {}
): Promise<LoginFormState> {
  const { email, password } = readCredentials(formData);

  const fieldErrors = missingFieldError(email, password);
  if (fieldErrors) {
    return withLoginFormState(formData, { fieldErrors });
  }

  const supabase = await resolveSupabase(deps);
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return withLoginFormState(formData, { fieldErrors: { form: domainErrorText(error) } });
  }

  await syncOwnerEmailBestEffort(data.user?.id, data.user?.email, deps.syncOwnerEmail);

  const redirectTo = deps.redirectTo ?? redirect;
  redirectTo("/");

  return {};
}

/** Persist nothing across a validation error — both fields are passwords. */
function withResetPasswordFormState(formData: FormData, state: LoginFormState): LoginFormState {
  return withPersistedFormState(formData, state, { omitKeys: ["password", "confirmPassword"] });
}

export async function resetPassword(
  _prevState: LoginFormState,
  formData: FormData,
  deps: LoginActionDeps = {}
): Promise<LoginFormState> {
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  if (password.length === 0) {
    return withResetPasswordFormState(formData, {
      fieldErrors: { password: { key: "errors.passwordRequired" } }
    });
  }
  if (confirmPassword.length === 0) {
    return withResetPasswordFormState(formData, {
      fieldErrors: { confirmPassword: { key: "errors.passwordRequired" } }
    });
  }
  if (password !== confirmPassword) {
    return withResetPasswordFormState(formData, {
      fieldErrors: { confirmPassword: { key: "errors.passwordMismatch" } }
    });
  }

  const supabase = await resolveSupabase(deps);
  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    // A missing/expired recovery session (direct navigation, a reused or
    // stale link) surfaces as this specific Supabase error name — worth a
    // friendly, translated message rather than forwarding the raw string via
    // domainErrorText, the same way handleAuthCallback maps a failed code
    // exchange to link_expired instead of a raw error.
    if (error.name === "AuthSessionMissingError") {
      return withResetPasswordFormState(formData, {
        fieldErrors: { form: { key: "errors.resetLinkExpired" } }
      });
    }
    return withResetPasswordFormState(formData, { fieldErrors: { form: domainErrorText(error) } });
  }

  // The recovery-link code exchange already left the browser signed in; sign
  // out so the Owner consciously signs back in with the new password, the
  // same "credentials in -> land on /" shape as signIn/simpleSignIn use.
  await supabase.auth.signOut();

  const redirectTo = deps.redirectTo ?? redirect;
  redirectTo("/login?message=password_reset");

  return {};
}

export async function signOut(formData: FormData, deps: LoginActionDeps = {}): Promise<void> {
  if (getAuthProvider() === "simple") {
    const { simpleSignOut } = await import("@/app/login/simple-actions");
    return simpleSignOut(formData, { redirectTo: deps.redirectTo });
  }

  const supabase = await resolveSupabase(deps);
  await supabase.auth.signOut();

  const redirectTo = deps.redirectTo ?? redirect;
  redirectTo("/login");
}
