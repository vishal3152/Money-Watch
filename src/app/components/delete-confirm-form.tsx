"use client";

import { useActionState } from "react";

import { useTranslator } from "@/i18n/client";
import type { LocalizedText } from "@/i18n/translator";

export type DeleteFormState = {
  formError?: LocalizedText;
};

const initialState: DeleteFormState = {};

export function DeleteConfirmForm({
  action,
  hiddenFields,
  confirmLabel
}: {
  action: (state: DeleteFormState, formData: FormData) => Promise<DeleteFormState>;
  hiddenFields: Record<string, string>;
  confirmLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const { t, text } = useTranslator();

  return (
    <form action={formAction}>
      {Object.entries(hiddenFields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      {state.formError ? (
        <p className="pw-banner-error" role="alert">
          {text(state.formError)}
        </p>
      ) : null}
      <button className="pw-button pw-button-danger" type="submit" disabled={pending}>
        {pending ? t("common.deleting") : confirmLabel}
      </button>
    </form>
  );
}
