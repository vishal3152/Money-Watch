"use client";

import Link from "next/link";
import { useActionState } from "react";

import { RequiredMark } from "@/app/components/required-mark";
import { SystemMessageBanner } from "@/app/components/system-message-banner";
import { requestPasswordReset, type LoginFormState } from "@/app/login/actions";
import { useTranslator } from "@/i18n/client";

const initialState: LoginFormState = {};

export function ForgotPasswordForm() {
  const { t, text } = useTranslator();
  const [state, action, pending] = useActionState(requestPasswordReset, initialState);

  return (
    <div className="pw-login">
      {state.message ? <SystemMessageBanner message={state.message} /> : null}

      <form key={state.formKey ?? "forgot-password"} action={action} noValidate>
        <div className="pw-field">
          <label htmlFor="forgot-password-email">
            {t("login.emailLabel")}
            <RequiredMark />
          </label>
          <input
            id="forgot-password-email"
            name="email"
            type="email"
            autoComplete="email"
            inputMode="email"
            required
            defaultValue={state.values?.email ?? ""}
            aria-invalid={state.fieldErrors?.email ? true : undefined}
          />
          {state.fieldErrors?.email ? (
            <p className="pw-field-error" role="alert">
              {text(state.fieldErrors.email)}
            </p>
          ) : null}
        </div>
        {state.fieldErrors?.form ? (
          <SystemMessageBanner message={{ type: "error", text: text(state.fieldErrors.form) }} />
        ) : null}
        <button className="pw-button" type="submit" disabled={pending}>
          {pending ? t("login.sendingResetLink") : t("login.sendResetLink")}
        </button>
      </form>

      <p>
        <Link href="/login">{t("login.signIn")}</Link>
      </p>
    </div>
  );
}
