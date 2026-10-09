"use client";

import { useActionState } from "react";

import { updateAccount, type EditAccountFormState } from "@/app/accounts/[id]/edit/actions";
import { RequiredMark } from "@/app/components/required-mark";
import { TEXT_FIELD_MAX_LENGTH } from "@/app/form-limits";
import type { Account } from "@/domain/account";
import { useTranslator } from "@/i18n/client";

export function AccountEditForm({ account }: { account: Account }) {
  const initialState: EditAccountFormState = {
    values: { name: account.name, accountNumber: account.accountNumber ?? "" }
  };
  const [state, formAction, pending] = useActionState(updateAccount, initialState);
  const { t, text } = useTranslator();

  return (
    <form key={state.formKey ?? "edit"} action={formAction} noValidate>
      <input type="hidden" name="accountId" value={account.id} />
      <div className="pw-field">
        <label htmlFor="account-name">
          {t("accounts.form.nameLabel")}
          <RequiredMark />
        </label>
        <input
          id="account-name"
          name="name"
          type="text"
          required
          maxLength={TEXT_FIELD_MAX_LENGTH}
          defaultValue={state.values?.name ?? account.name}
          aria-invalid={state.fieldErrors?.name ? true : undefined}
          aria-describedby={state.fieldErrors?.name ? "account-name-error" : undefined}
        />
        {state.fieldErrors?.name ? (
          <p className="pw-field-error" id="account-name-error" role="alert">
            {text(state.fieldErrors.name)}
          </p>
        ) : null}
      </div>
      <div className="pw-field">
        <label htmlFor="account-number">{t("accounts.form.numberLabel")}</label>
        <input
          id="account-number"
          name="accountNumber"
          type="text"
          maxLength={TEXT_FIELD_MAX_LENGTH}
          defaultValue={state.values?.accountNumber ?? account.accountNumber ?? ""}
          aria-invalid={state.fieldErrors?.accountNumber ? true : undefined}
          aria-describedby={
            state.fieldErrors?.accountNumber ? "account-number-error" : undefined
          }
        />
        {state.fieldErrors?.accountNumber ? (
          <p className="pw-field-error" id="account-number-error" role="alert">
            {text(state.fieldErrors.accountNumber)}
          </p>
        ) : null}
      </div>
      <button className="pw-button" type="submit" disabled={pending}>
        {pending ? t("common.saving") : t("common.saveChanges")}
      </button>
    </form>
  );
}
