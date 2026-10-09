"use client";

import { useActionState } from "react";

import {
  createInstitution,
  type InstitutionFormState
} from "@/app/institutions/new/actions";
import { RequiredMark } from "@/app/components/required-mark";
import { TEXT_FIELD_MAX_LENGTH } from "@/app/form-limits";
import { useTranslator } from "@/i18n/client";

const initialState: InstitutionFormState = {};

export function InstitutionForm() {
  const [state, formAction, pending] = useActionState(createInstitution, initialState);
  const { t, text } = useTranslator();
  const nameError = state.fieldErrors?.name;

  return (
    <form key={state.formKey ?? "new"} action={formAction} noValidate>
      <div className="pw-field">
        <label htmlFor="institution-name">
          {t("institutions.form.nameLabel")}
          <RequiredMark />
        </label>
        <input
          id="institution-name"
          name="name"
          type="text"
          autoComplete="organization"
          required
          maxLength={TEXT_FIELD_MAX_LENGTH}
          defaultValue={state.values?.name ?? ""}
          aria-invalid={nameError ? true : undefined}
          aria-describedby={nameError ? "institution-name-error" : undefined}
        />
        {nameError ? (
          <p className="pw-field-error" id="institution-name-error" role="alert">
            {text(nameError)}
          </p>
        ) : null}
      </div>
      <button className="pw-button" type="submit" disabled={pending}>
        {pending ? t("common.saving") : t("institutions.form.submit")}
      </button>
    </form>
  );
}
