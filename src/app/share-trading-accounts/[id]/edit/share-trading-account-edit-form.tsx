"use client";

import { useActionState } from "react";

import {
  updateShareTradingAccount,
  type EditShareTradingAccountFormState
} from "@/app/share-trading-accounts/[id]/edit/actions";
import { RequiredMark } from "@/app/components/required-mark";
import { TEXT_FIELD_MAX_LENGTH } from "@/app/form-limits";
import type { ShareTradingAccount } from "@/domain/share-trading-account";
import { useTranslator } from "@/i18n/client";

export function ShareTradingAccountEditForm({
  shareTradingAccount
}: {
  shareTradingAccount: ShareTradingAccount;
}) {
  const initialState: EditShareTradingAccountFormState = {
    values: {
      name: shareTradingAccount.name,
      accountNumber: shareTradingAccount.accountNumber ?? ""
    }
  };
  const [state, formAction, pending] = useActionState(updateShareTradingAccount, initialState);
  const { t, text } = useTranslator();

  return (
    <form key={state.formKey ?? "edit"} action={formAction} noValidate>
      <input type="hidden" name="shareTradingAccountId" value={shareTradingAccount.id} />
      <div className="pw-field">
        <label htmlFor="share-trading-account-name">
          {t("accounts.form.nameLabel")}
          <RequiredMark />
        </label>
        <input
          id="share-trading-account-name"
          name="name"
          type="text"
          required
          maxLength={TEXT_FIELD_MAX_LENGTH}
          defaultValue={state.values?.name ?? shareTradingAccount.name}
          aria-invalid={state.fieldErrors?.name ? true : undefined}
          aria-describedby={state.fieldErrors?.name ? "share-trading-account-name-error" : undefined}
        />
        {state.fieldErrors?.name ? (
          <p className="pw-field-error" id="share-trading-account-name-error" role="alert">
            {text(state.fieldErrors.name)}
          </p>
        ) : null}
      </div>
      <div className="pw-field">
        <label htmlFor="share-trading-account-number">{t("accounts.form.numberLabel")}</label>
        <input
          id="share-trading-account-number"
          name="accountNumber"
          type="text"
          maxLength={TEXT_FIELD_MAX_LENGTH}
          defaultValue={state.values?.accountNumber ?? shareTradingAccount.accountNumber ?? ""}
          aria-invalid={state.fieldErrors?.accountNumber ? true : undefined}
          aria-describedby={
            state.fieldErrors?.accountNumber ? "share-trading-account-number-error" : undefined
          }
        />
        {state.fieldErrors?.accountNumber ? (
          <p className="pw-field-error" id="share-trading-account-number-error" role="alert">
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
