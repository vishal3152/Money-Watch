"use client";

import { useActionState, useState } from "react";

import { createShareTradingAccount, type ShareTradingAccountFormState } from "@/app/share-trading-accounts/new/actions";
import { BackLink } from "@/app/components/back-link";
import { RequiredMark } from "@/app/components/required-mark";
import { SheetSelect } from "@/app/components/sheet-select";
import { TEXT_FIELD_MAX_LENGTH } from "@/app/form-limits";
import type { Institution } from "@/domain/institution";
import { useTranslator } from "@/i18n/client";

const initialState: ShareTradingAccountFormState = {};

const COMMON_CURRENCIES = ["USD", "INR", "EUR", "GBP", "SGD"] as const;

export function ShareTradingAccountForm({
  institutions,
  initialInstitutionId
}: {
  institutions: Institution[];
  initialInstitutionId?: string;
}) {
  const { t, text } = useTranslator();
  const [state, formAction, pending] = useActionState(createShareTradingAccount, initialState);
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
      <h1>{t("shareTrading.new.heading")}</h1>
      {state.formError ? (
        <p className="pw-banner-error" role="alert">
          {text(state.formError)}
        </p>
      ) : null}
      <SheetSelect
        id="share-trading-account-institution"
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
          defaultValue={state.values?.name ?? ""}
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
          defaultValue={state.values?.accountNumber ?? ""}
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
      <div className="pw-field">
        <label htmlFor="share-trading-account-currency">
          {t("accounts.form.currencyLabel")}
          <RequiredMark />
        </label>
        <input
          id="share-trading-account-currency"
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
            state.fieldErrors?.currencyCode ? "share-trading-account-currency-error" : undefined
          }
        />
        <div className="pw-choice-chips" role="group" aria-label={t("accounts.form.commonCurrencies")}>
          {COMMON_CURRENCIES.map((code) => (
            <button
              key={code}
              type="button"
              className={currencyCode === code ? "pw-choice-chip is-selected" : "pw-choice-chip"}
              onClick={() => setCurrencyCode(code)}
            >
              {code}
            </button>
          ))}
        </div>
        {state.fieldErrors?.currencyCode ? (
          <p className="pw-field-error" id="share-trading-account-currency-error" role="alert">
            {text(state.fieldErrors.currencyCode)}
          </p>
        ) : null}
      </div>
      <button className="pw-button" type="submit" disabled={pending || institutions.length === 0}>
        {pending ? t("common.saving") : t("shareTrading.form.submit")}
      </button>
    </form>
  );
}
