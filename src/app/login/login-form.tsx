"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";

import { RequiredMark } from "@/app/components/required-mark";
import { SegmentedControl } from "@/app/components/segmented-control";
import { SystemMessageBanner } from "@/app/components/system-message-banner";
import type { SystemMessage } from "@/app/components/system-message";
import { signIn, signInWithGoogle, signUp, type LoginFormState } from "@/app/login/actions";
import { useTranslator } from "@/i18n/client";

const initialState: LoginFormState = {};

type LoginMode = "sign-in" | "create";

type LoginFormProps = {
  /** A message carried across a redirect into this page, e.g. from /auth/callback. */
  initialMessage?: SystemMessage;
};

export function LoginForm({ initialMessage }: LoginFormProps) {
  const { t, text } = useTranslator();
  const modeOptions = [
    { value: "sign-in", label: t("login.signIn") },
    { value: "create", label: t("login.createAccount") }
  ];
  const [signInState, signInAction, signInPending] = useActionState(signIn, initialState);
  const [signUpState, signUpAction, signUpPending] = useActionState(signUp, initialState);
  const [mode, setMode] = useState<LoginMode>("sign-in");

  useEffect(() => {
    if (signUpState.message || signUpState.fieldErrors) {
      setMode("create");
    }
  }, [signUpState.message, signUpState.fieldErrors]);

  useEffect(() => {
    if (signInState.fieldErrors) {
      setMode("sign-in");
    }
  }, [signInState.fieldErrors]);

  const pending = signInPending || signUpPending;

  return (
    <div className="pw-login">
      {initialMessage ? <SystemMessageBanner message={initialMessage} /> : null}

      <div className="pw-field pw-login-mode">
        <SegmentedControl
          aria-label={t("login.accountAction")}
          value={mode}
          options={modeOptions}
          onChange={(next) => setMode(next as LoginMode)}
          disabled={pending}
        />
      </div>

      {mode === "sign-in" ? (
        <form key={signInState.formKey ?? "sign-in"} action={signInAction} noValidate>
          <div className="pw-field">
            <label htmlFor="sign-in-email">
              {t("login.emailLabel")}
              <RequiredMark />
            </label>
            <input
              id="sign-in-email"
              name="email"
              type="email"
              autoComplete="email"
              inputMode="email"
              required
              defaultValue={signInState.values?.email ?? ""}
              aria-invalid={signInState.fieldErrors?.email ? true : undefined}
            />
            {signInState.fieldErrors?.email ? (
              <p className="pw-field-error" role="alert">
                {text(signInState.fieldErrors.email)}
              </p>
            ) : null}
          </div>
          <div className="pw-field">
            <label htmlFor="sign-in-password">
              {t("login.passwordLabel")}
              <RequiredMark />
            </label>
            <input
              id="sign-in-password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              aria-invalid={signInState.fieldErrors?.password ? true : undefined}
            />
            {signInState.fieldErrors?.password ? (
              <p className="pw-field-error" role="alert">
                {text(signInState.fieldErrors.password)}
              </p>
            ) : null}
          </div>
          {signInState.fieldErrors?.form ? (
            <SystemMessageBanner
              message={{ type: "error", text: text(signInState.fieldErrors.form) }}
            />
          ) : null}
          <p>
            <Link href="/login/forgot-password">{t("login.forgotPasswordLink")}</Link>
          </p>
          <button className="pw-button" type="submit" disabled={signInPending}>
            {signInPending ? t("login.signingIn") : t("login.signIn")}
          </button>
        </form>
      ) : (
        <form key={signUpState.formKey ?? "sign-up"} action={signUpAction} noValidate>
          {signUpState.message ? <SystemMessageBanner message={signUpState.message} /> : null}
          <div className="pw-field">
            <label htmlFor="sign-up-email">
              {t("login.emailLabel")}
              <RequiredMark />
            </label>
            <input
              id="sign-up-email"
              name="email"
              type="email"
              autoComplete="email"
              inputMode="email"
              required
              defaultValue={signUpState.values?.email ?? ""}
              aria-invalid={signUpState.fieldErrors?.email ? true : undefined}
            />
            {signUpState.fieldErrors?.email ? (
              <p className="pw-field-error" role="alert">
                {text(signUpState.fieldErrors.email)}
              </p>
            ) : null}
          </div>
          <div className="pw-field">
            <label htmlFor="sign-up-password">
              {t("login.passwordLabel")}
              <RequiredMark />
            </label>
            <input
              id="sign-up-password"
              name="password"
              type="password"
              autoComplete="new-password"
              required
              aria-invalid={signUpState.fieldErrors?.password ? true : undefined}
            />
            {signUpState.fieldErrors?.password ? (
              <p className="pw-field-error" role="alert">
                {text(signUpState.fieldErrors.password)}
              </p>
            ) : null}
          </div>
          {signUpState.fieldErrors?.form ? (
            <SystemMessageBanner
              message={{ type: "error", text: text(signUpState.fieldErrors.form) }}
            />
          ) : null}
          <button className="pw-button" type="submit" disabled={signUpPending}>
            {signUpPending ? t("login.creatingAccount") : t("login.createAccount")}
          </button>
        </form>
      )}

      {mode === "sign-in" ? (
        <div className="pw-login-alt">
          <p className="pw-login-alt-rule" role="separator">
            <span>{t("login.or")}</span>
          </p>
          <form action={signInWithGoogle}>
            <button className="pw-button pw-button-secondary pw-login-google" type="submit">
              <GoogleMark />
              {t("login.signInWithGoogle")}
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}

function GoogleMark() {
  return (
    <svg className="pw-login-google-mark" viewBox="0 0 18 18" width="18" height="18" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z"
      />
      <path
        fill="#FBBC05"
        d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332Z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58Z"
      />
    </svg>
  );
}
