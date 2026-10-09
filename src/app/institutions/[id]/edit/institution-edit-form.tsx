"use client";

import { useActionState } from "react";

import {
  updateInstitution,
  type EditInstitutionFormState
} from "@/app/institutions/[id]/edit/actions";
import { RequiredMark } from "@/app/components/required-mark";
import { TEXT_FIELD_MAX_LENGTH } from "@/app/form-limits";
import { useTranslator } from "@/i18n/client";
import type { Institution } from "@/domain/institution";

export function InstitutionEditForm({ institution }: { institution: Institution }) {
  const initialState: EditInstitutionFormState = { values: { name: institution.name } };
  const [state, formAction, pending] = useActionState(updateInstitution, initialState);
  const { t, text } = useTranslator();
  const nameError = state.fieldErrors?.name;

  return (
    <form key={state.formKey ?? "edit"} action={formAction} noValidate>
      <input type="hidden" name="institutionId" value={institution.id} />
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
          defaultValue={state.values?.name ?? institution.name}
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
        {pending ? t("common.saving") : t("common.saveChanges")}
      </button>
    </form>
  );
}
