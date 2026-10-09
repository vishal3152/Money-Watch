"use client";

import { useActionState } from "react";

import { RequiredMark } from "@/app/components/required-mark";
import { SystemMessageBanner } from "@/app/components/system-message-banner";
import { resetPassword, type LoginFormState } from "@/app/login/actions";
import { useTranslator } from "@/i18n/client";

const initialState: LoginFormState = {};

export function ResetPasswordForm() {
  const { t, text } = useTranslator();
  const [state, action, pending] = useActionState(resetPassword, initialState);

  return (
    <div className="pw-login">
      <form key={state.formKey ?? "reset-password"} action={action} noValidate>
        <div className="pw-field">
          <label htmlFor="reset-password-password">
            {t("login.newPasswordLabel")}
            <RequiredMark />
          </label>
          <input
            id="reset-password-password"
            name="password"
            type="password"
            autoComplete="new-password"
            required
            aria-invalid={state.fieldErrors?.password ? true : undefined}
          />
          {state.fieldErrors?.password ? (
            <p className="pw-field-error" role="alert">
              {text(state.fieldErrors.password)}
            </p>
          ) : null}
        </div>
        <div className="pw-field">
          <label htmlFor="reset-password-confirm-password">
            {t("login.confirmPasswordLabel")}
            <RequiredMark />
          </label>
          <input
            id="reset-password-confirm-password"
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            required
            aria-invalid={state.fieldErrors?.confirmPassword ? true : undefined}
          />
          {state.fieldErrors?.confirmPassword ? (
            <p className="pw-field-error" role="alert">
              {text(state.fieldErrors.confirmPassword)}
            </p>
          ) : null}
        </div>
        {state.fieldErrors?.form ? (
          <SystemMessageBanner message={{ type: "error", text: text(state.fieldErrors.form) }} />
        ) : null}
        <button className="pw-button" type="submit" disabled={pending}>
          {pending ? t("login.settingNewPassword") : t("login.setNewPassword")}
        </button>
      </form>
    </div>
  );
}
