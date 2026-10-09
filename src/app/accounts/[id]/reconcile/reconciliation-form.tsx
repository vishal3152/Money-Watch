"use client";

import { useActionState } from "react";

import {
  reconcileAccount,
  type ReconciliationFormState
} from "@/app/accounts/[id]/reconcile/actions";
import { BackLink } from "@/app/components/back-link";
import { DecimalInput } from "@/app/components/decimal-input";
import { RequiredMark } from "@/app/components/required-mark";
import { toDateInputValue } from "@/app/datetime-local";
import { useTranslator } from "@/i18n/client";

const initialState: ReconciliationFormState = {};

export function ReconciliationForm({
  accountId,
  currencyCode
}: {
  accountId: string;
  currencyCode: string;
}) {
  const { t, text } = useTranslator();
  const [state, formAction, pending] = useActionState(reconcileAccount, initialState);

  return (
    <form key={state.formKey ?? "new"} className="pw-card" action={formAction} noValidate>
      <BackLink href={`/accounts/${accountId}`} label={t("transactions.backToAccount")} />
      <h1>{t("reconcile.heading")}</h1>
      <p className="pw-detail-lede">{t("reconcile.lede")}</p>
      <input name="accountId" type="hidden" value={accountId} />
      {state.formError ? (
        <p className="pw-banner-error" role="alert">
          {text(state.formError)}
        </p>
      ) : null}
      <div className="pw-field">
        <label htmlFor="reported-balance">
          {t("reconcile.balanceLabel", { currency: currencyCode })}
          <RequiredMark />
        </label>
        <DecimalInput
          id="reported-balance"
          name="balance"
          allowNegative
          required
          defaultValue={state.values?.balance ?? ""}
          aria-invalid={state.fieldErrors?.balance ? true : undefined}
          aria-describedby={
            state.fieldErrors?.balance ? "reported-balance-error" : undefined
          }
        />
        {state.fieldErrors?.balance ? (
          <p className="pw-field-error" id="reported-balance-error" role="alert">
            {text(state.fieldErrors.balance)}
          </p>
        ) : null}
      </div>
      <div className="pw-field">
        <label htmlFor="balance-as-of">
          {t("reconcile.asOfLabel")}
          <RequiredMark />
        </label>
        <input
          id="balance-as-of"
          name="asOfDate"
          type="date"
          required
          defaultValue={
            state.values?.asOfDate ?? toDateInputValue(new Date())
          }
          aria-invalid={state.fieldErrors?.asOfDate ? true : undefined}
          aria-describedby={
            state.fieldErrors?.asOfDate ? "balance-as-of-error" : undefined
          }
        />
        {state.fieldErrors?.asOfDate ? (
          <p className="pw-field-error" id="balance-as-of-error" role="alert">
            {text(state.fieldErrors.asOfDate)}
          </p>
        ) : null}
      </div>
      <button className="pw-button" type="submit" disabled={pending}>
        {pending ? t("reconcile.comparing") : t("reconcile.submit")}
      </button>
    </form>
  );
}
