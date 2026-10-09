"use client";

import { useActionState } from "react";

import { RequiredMark } from "@/app/components/required-mark";
import { SystemMessageBanner } from "@/app/components/system-message-banner";
import type { SystemMessage } from "@/app/components/system-message";
import { simpleSignIn } from "@/app/login/simple-actions";
import type { LoginFormState } from "@/app/login/actions";
import { useTranslator } from "@/i18n/client";

const initialState: LoginFormState = {};

type SimpleLoginFormProps = {
  /** A message carried across a redirect into this page. */
  initialMessage?: SystemMessage;
};

export function SimpleLoginForm({ initialMessage }: SimpleLoginFormProps) {
  const { t, text } = useTranslator();
  const [state, action, pending] = useActionState(simpleSignIn, initialState);

  return (
    <div className="pw-login">
      {initialMessage ? <SystemMessageBanner message={initialMessage} /> : null}

      <form key={state.formKey ?? "simple-sign-in"} action={action} noValidate>
        <div className="pw-field">
          <label htmlFor="simple-email">
            {t("login.emailLabel")}
            <RequiredMark />
          </label>
          <input
            id="simple-email"
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
        <div className="pw-field">
          <label htmlFor="simple-password">
            {t("login.passwordLabel")}
            <RequiredMark />
          </label>
          <input
            id="simple-password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            aria-invalid={state.fieldErrors?.password ? true : undefined}
          />
          {state.fieldErrors?.password ? (
            <p className="pw-field-error" role="alert">
              {text(state.fieldErrors.password)}
            </p>
          ) : null}
        </div>
        {state.fieldErrors?.form ? (
          <SystemMessageBanner message={{ type: "error", text: text(state.fieldErrors.form) }} />
        ) : null}
        <button className="pw-button" type="submit" disabled={pending}>
          {pending ? t("login.signingIn") : t("login.signIn")}
        </button>
      </form>
    </div>
  );
}
