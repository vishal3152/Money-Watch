"use client";

import { useActionState, useState } from "react";

import { createAccount, type AccountFormState } from "@/app/accounts/new/actions";
import { BackLink } from "@/app/components/back-link";
import { RequiredMark } from "@/app/components/required-mark";
import { SheetSelect } from "@/app/components/sheet-select";
import { TEXT_FIELD_MAX_LENGTH } from "@/app/form-limits";
import type { Institution } from "@/domain/institution";
import { useTranslator } from "@/i18n/client";

const initialState: AccountFormState = {};

const COMMON_CURRENCIES = ["INR", "USD", "EUR", "GBP", "AED", "SGD"] as const;

export function AccountForm({
  institutions,
  initialInstitutionId
}: {
  institutions: Institution[];
  initialInstitutionId?: string;
}) {
  const { t, text } = useTranslator();
  const [state, formAction, pending] = useActionState(createAccount, initialState);
  const [institutionId, setInstitutionId] = useState(() => {
    const persisted = state.values?.institutionId;
    if (persisted && institutions.some((institution) => institution.id === persisted)) {
      return persisted;
    }
    if (
      initialInstitutionId &&
      institutions.some((institution) => institution.id === initialInstitutionId)
    ) {
      return initialInstitutionId;
    }
    return institutions[0]?.id ?? "";
  });
  const [currencyCode, setCurrencyCode] = useState(() => state.values?.currencyCode ?? "");

  return (
    <form key={state.formKey ?? "new"} className="pw-card" action={formAction} noValidate>
      <BackLink href="/" label={t("common.backToDashboard")} />
      <h1>{t("accounts.new.heading")}</h1>
      {state.formError ? (
        <p className="pw-banner-error" role="alert">
          {text(state.formError)}
        </p>
      ) : null}
      <SheetSelect
        id="account-institution"
        name="institutionId"
        label={t("accounts.form.institutionLabel")}
        value={institutionId}
        options={institutions.map((institution) => ({
          value: institution.id,
          label: institution.name
        }))}
        onChange={setInstitutionId}
        required
      />
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
          defaultValue={state.values?.name ?? ""}
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
          defaultValue={state.values?.accountNumber ?? ""}
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
      <div className="pw-field">
        <label htmlFor="account-currency">
          {t("accounts.form.currencyLabel")}
          <RequiredMark />
        </label>
        <input
          id="account-currency"
          name="currencyCode"
          type="text"
          inputMode="text"
          maxLength={3}
          autoCapitalize="characters"
          autoComplete="off"
          required
          value={currencyCode}
          onChange={(event) => setCurrencyCode(event.target.value.toUpperCase())}
          aria-invalid={state.fieldErrors?.currencyCode ? true : undefined}
          aria-describedby={
            state.fieldErrors?.currencyCode ? "account-currency-error" : undefined
          }
        />
        <div className="pw-choice-chips" role="group" aria-label={t("accounts.form.commonCurrencies")}>
          {COMMON_CURRENCIES.map((code) => (
            <button
              key={code}
              type="button"
              className={
                currencyCode === code ? "pw-choice-chip is-selected" : "pw-choice-chip"
              }
              onClick={() => setCurrencyCode(code)}
            >
              {code}
            </button>
          ))}
        </div>
        {state.fieldErrors?.currencyCode ? (
          <p className="pw-field-error" id="account-currency-error" role="alert">
            {text(state.fieldErrors.currencyCode)}
          </p>
        ) : null}
      </div>
      <button className="pw-button" type="submit" disabled={pending || institutions.length === 0}>
        {pending ? t("common.saving") : t("accounts.form.submit")}
      </button>
    </form>
  );
}
