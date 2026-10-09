"use client";

import { useActionState, useState } from "react";

import type { DeleteFormState } from "@/app/components/delete-confirm-form";
import { RequiredMark } from "@/app/components/required-mark";
import { TEXT_FIELD_MAX_LENGTH } from "@/app/form-limits";
import { useTranslator } from "@/i18n/client";
import type { LocalizedText } from "@/i18n/translator";

const initialState: DeleteFormState = {};

export function HardDeleteConfirmForm({
  action,
  hiddenFields,
  confirmName,
  confirmLabel
}: {
  action: (state: DeleteFormState, formData: FormData) => Promise<DeleteFormState>;
  hiddenFields: Record<string, string>;
  /** The exact value the owner must type before the destructive button enables. */
  confirmName: string;
  confirmLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const [typedName, setTypedName] = useState("");
  const { t, text } = useTranslator();
  // Split around the placeholder so the emphasised name keeps its place in
  // languages that order the sentence differently.
  const [beforeName, afterName] = t("common.typeToConfirm").split("{name}");

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
      <label htmlFor="hard-delete-confirm-name">
        {beforeName}
        <strong>{confirmName}</strong>
        {afterName}
        <RequiredMark />
      </label>
      <input
        id="hard-delete-confirm-name"
        name="confirmName"
        type="text"
        autoComplete="off"
        maxLength={TEXT_FIELD_MAX_LENGTH}
        value={typedName}
        onChange={(event) => setTypedName(event.target.value)}
      />
      <button
        className="pw-button pw-button-danger"
        type="submit"
        disabled={pending || typedName !== confirmName}
      >
        {pending ? t("common.deleting") : confirmLabel}
      </button>
    </form>
  );
}
