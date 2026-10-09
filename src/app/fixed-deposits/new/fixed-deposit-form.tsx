"use client";

import { useActionState, useState } from "react";

import {
  createFixedDeposit,
  type FixedDepositFormState
} from "@/app/fixed-deposits/new/actions";
import { BackLink } from "@/app/components/back-link";
import { DecimalInput } from "@/app/components/decimal-input";
import { RequiredMark } from "@/app/components/required-mark";
import { SheetSelect } from "@/app/components/sheet-select";
import { ToggleField } from "@/app/components/toggle-field";
import { toDateInputValue } from "@/app/datetime-local";
import { TEXT_FIELD_MAX_LENGTH } from "@/app/form-limits";
import type { Account } from "@/domain/account";
import type { Institution } from "@/domain/institution";
import { useTranslator } from "@/i18n/client";

const initialState: FixedDepositFormState = {};

export function FixedDepositForm({
  institutions,
  accounts,
  initialInstitutionId
}: {
  institutions: Institution[];
  accounts: Account[];
  initialInstitutionId?: string;
}) {
  const { t, text } = useTranslator();
  const [state, formAction, pending] = useActionState(createFixedDeposit, initialState);
  // institutionId/linkedAccountId are controlled component state, not tied to
  // `state.values` — `key={state.formKey}` below is on the <form> element,
  // not this component, so a failed submission never remounts FixedDepositForm
  // itself; these useState initializers only ever run once, before any
  // server action has returned, so a `state.values?.X` fallback here would be
  // permanently unreachable. The selection already survives a failed submit
  // because this component's own state isn't reset.
  const [institutionId, setInstitutionId] = useState(() => {
    if (
      initialInstitutionId &&
      institutions.some((institution) => institution.id === initialInstitutionId)
    ) {
      return initialInstitutionId;
    }
    return institutions[0]?.id ?? "";
  });
  const accountsForInstitution = accounts.filter(
    (account) => account.institutionId === institutionId
  );
  const noAccountsForInstitution = accountsForInstitution.length === 0;
  const [linkedAccountId, setLinkedAccountId] = useState(
    () => accounts.find((account) => account.institutionId === institutionId)?.id ?? ""
  );
  const [idempotencyKey] = useState(() => crypto.randomUUID());

  function handleInstitutionChange(nextInstitutionId: string) {
    setInstitutionId(nextInstitutionId);
    const nextAccounts = accounts.filter((account) => account.institutionId === nextInstitutionId);
    setLinkedAccountId(nextAccounts[0]?.id ?? "");
  }

  return (
    <form key={state.formKey ?? "new"} className="pw-card" action={formAction} noValidate>
      <BackLink href="/" label={t("common.backToDashboard")} />
      <h1>{t("fixedDeposits.new.heading")}</h1>
      <input name="idempotencyKey" type="hidden" value={idempotencyKey} />
      {state.formError ? (
        <p className="pw-banner-error" role="alert">
          {text(state.formError)}
        </p>
      ) : null}
      <fieldset className="pw-fieldset">
        <legend>{t("fixedDeposits.form.institutionAndAccount")}</legend>
        <SheetSelect
          id="fd-institution"
          name="institutionId"
          label={t("fixedDeposits.form.institutionLabel")}
          value={institutionId}
          options={institutions.map((institution) => ({
            value: institution.id,
            label: institution.name
          }))}
          onChange={handleInstitutionChange}
          required
        />
        <SheetSelect
          id="fd-account"
          name="linkedAccountId"
          label={t("fixedDeposits.form.linkedAccountLabel")}
          value={linkedAccountId}
          options={accountsForInstitution.map((account) => ({
            value: account.id,
            label: `${account.name} · ${account.currencyCode}`
          }))}
          onChange={setLinkedAccountId}
          required
          disabled={noAccountsForInstitution}
          invalid={noAccountsForInstitution || Boolean(state.fieldErrors?.linkedAccountId)}
          errorId={
            noAccountsForInstitution || state.fieldErrors?.linkedAccountId
              ? "fd-account-error"
              : undefined
          }
          error={
            noAccountsForInstitution
              ? t("fixedDeposits.form.noAccountsForInstitution")
              : state.fieldErrors?.linkedAccountId
                ? text(state.fieldErrors.linkedAccountId)
                : undefined
          }
        />
      </fieldset>

      <fieldset className="pw-fieldset">
        <legend>{t("fixedDeposits.form.details")}</legend>
        <div className="pw-field">
          <label htmlFor="fd-name">
            {t("fixedDeposits.form.nameLabel")}
            <RequiredMark />
          </label>
          <input
            id="fd-name"
            name="name"
            type="text"
            required
            maxLength={TEXT_FIELD_MAX_LENGTH}
            defaultValue={state.values?.name ?? ""}
            aria-invalid={state.fieldErrors?.name ? true : undefined}
            aria-describedby={state.fieldErrors?.name ? "fd-name-error" : undefined}
          />
          {state.fieldErrors?.name ? (
            <p className="pw-field-error" id="fd-name-error" role="alert">
              {text(state.fieldErrors.name)}
            </p>
          ) : null}
        </div>
        <div className="pw-field">
          <label htmlFor="fd-account-number">{t("fixedDeposits.form.accountNumberLabel")}</label>
          <input
            id="fd-account-number"
            name="accountNumber"
            type="text"
            maxLength={TEXT_FIELD_MAX_LENGTH}
            defaultValue={state.values?.accountNumber ?? ""}
            aria-invalid={state.fieldErrors?.accountNumber ? true : undefined}
            aria-describedby={
              state.fieldErrors?.accountNumber ? "fd-account-number-error" : undefined
            }
          />
          {state.fieldErrors?.accountNumber ? (
            <p className="pw-field-error" id="fd-account-number-error" role="alert">
              {text(state.fieldErrors.accountNumber)}
            </p>
          ) : null}
        </div>
      </fieldset>

      <fieldset className="pw-fieldset">
        <legend>{t("fixedDeposits.form.terms")}</legend>
        <div className="pw-field">
          <label htmlFor="fd-principal">
            {t("fixedDeposits.form.principalLabel")}
            <RequiredMark />
          </label>
          <DecimalInput
            id="fd-principal"
            name="principal"
            required
            defaultValue={state.values?.principal ?? ""}
            aria-invalid={state.fieldErrors?.principal ? true : undefined}
            aria-describedby={state.fieldErrors?.principal ? "fd-principal-error" : undefined}
          />
          {state.fieldErrors?.principal ? (
            <p className="pw-field-error" id="fd-principal-error" role="alert">
              {text(state.fieldErrors.principal)}
            </p>
          ) : null}
        </div>
        <div className="pw-field">
          <label htmlFor="fd-rate">
            {t("fixedDeposits.form.interestRateLabel")}
            <RequiredMark />
          </label>
          <DecimalInput
            id="fd-rate"
            name="interestRate"
            required
            defaultValue={state.values?.interestRate ?? ""}
            aria-invalid={state.fieldErrors?.interestRate ? true : undefined}
            aria-describedby={state.fieldErrors?.interestRate ? "fd-rate-error" : undefined}
          />
          {state.fieldErrors?.interestRate ? (
            <p className="pw-field-error" id="fd-rate-error" role="alert">
              {text(state.fieldErrors.interestRate)}
            </p>
          ) : null}
        </div>
        <div className="pw-field">
          <label htmlFor="fd-opened">
            {t("fixedDeposits.form.openedDateLabel")}
            <RequiredMark />
          </label>
          <input
            id="fd-opened"
            name="openedDate"
            type="date"
            required
            defaultValue={
              state.values?.openedDate ?? toDateInputValue(new Date())
            }
            aria-invalid={state.fieldErrors?.openedDate ? true : undefined}
            aria-describedby={state.fieldErrors?.openedDate ? "fd-opened-error" : undefined}
          />
          {state.fieldErrors?.openedDate ? (
            <p className="pw-field-error" id="fd-opened-error" role="alert">
              {text(state.fieldErrors.openedDate)}
            </p>
          ) : null}
        </div>
        <div className="pw-field">
          <label htmlFor="fd-maturity">
            {t("fixedDeposits.form.maturityDateLabel")}
            <RequiredMark />
          </label>
          <input
            id="fd-maturity"
            name="maturityDate"
            type="date"
            required
            defaultValue={state.values?.maturityDate ?? ""}
            aria-invalid={state.fieldErrors?.maturityDate ? true : undefined}
            aria-describedby={state.fieldErrors?.maturityDate ? "fd-maturity-error" : undefined}
          />
          {state.fieldErrors?.maturityDate ? (
            <p className="pw-field-error" id="fd-maturity-error" role="alert">
              {text(state.fieldErrors.maturityDate)}
            </p>
          ) : null}
        </div>
      </fieldset>

      <ToggleField
        id="fd-debit-now"
        name="debitNow"
        label={t("fixedDeposits.form.debitNowLabel")}
        help={t("fixedDeposits.form.debitNowHelp")}
        defaultChecked={state.values ? state.values.debitNow === "on" : true}
      />
      <button
        className="pw-button"
        type="submit"
        disabled={pending || noAccountsForInstitution}
      >
        {pending ? t("common.saving") : t("fixedDeposits.form.submit")}
      </button>
    </form>
  );
}
