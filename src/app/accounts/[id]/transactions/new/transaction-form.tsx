"use client";

import { useActionState, useState } from "react";

import {
  createTransaction,
  type TransactionFormState
} from "@/app/accounts/[id]/transactions/new/actions";
import { updateTransaction } from "@/app/accounts/[id]/transactions/[transactionId]/edit/actions";
import { BackLink } from "@/app/components/back-link";
import { DecimalInput } from "@/app/components/decimal-input";
import { RequiredMark } from "@/app/components/required-mark";
import { SegmentedControl } from "@/app/components/segmented-control";
import { SheetSelect } from "@/app/components/sheet-select";
import { toDatetimeLocalValue } from "@/app/datetime-local";
import { TEXT_FIELD_MAX_LENGTH } from "@/app/form-limits";
import { categoriesForKind, type TransactionKind } from "@/domain/transaction-category";
import { useTranslator } from "@/i18n/client";

const initialState: TransactionFormState = {};

function initialKind(values: Record<string, string> | undefined, fallback: TransactionKind): TransactionKind {
  if (values?.kind === "Income" || values?.kind === "Expense") {
    return values.kind;
  }
  return fallback;
}

export type TransactionFormInitialValues = {
  transactionId: string;
  kind: TransactionKind;
  category: string;
  amount: string;
  description: string;
  occurredAt: string;
};

export function TransactionForm({
  accountId,
  currencyCode,
  returnTo,
  initialValues
}: {
  accountId: string;
  currencyCode: string;
  returnTo?: string;
  initialValues?: TransactionFormInitialValues;
}) {
  const { t, text } = useTranslator();
  const isEdit = initialValues !== undefined;
  const [state, formAction, pending] = useActionState(
    isEdit ? updateTransaction : createTransaction,
    initialState
  );
  // Regenerated whenever the form remounts (a fresh `/new` navigation, or the
  // formKey-forced remount after a validation error) so a genuine resubmission
  // never collides with an earlier failed attempt's key.
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [kind, setKind] = useState<TransactionKind>(() =>
    initialKind(state.values, initialValues?.kind ?? "Expense")
  );
  const categories = categoriesForKind(kind);
  const [category, setCategory] = useState<string>(() => {
    const preferred = state.values?.category ?? initialValues?.category;
    if (preferred && categoriesForKind(kind).includes(preferred as never)) {
      return preferred;
    }
    return categoriesForKind(kind)[0];
  });

  const kindOptions = [
    { value: "Expense", label: t("transactionKind.Expense") },
    { value: "Income", label: t("transactionKind.Income") }
  ];

  function handleKindChange(next: TransactionKind) {
    setKind(next);
    setCategory(categoriesForKind(next)[0]);
  }

  return (
    <form key={state.formKey ?? "new"} className="pw-card" action={formAction} noValidate>
      <BackLink href={`/accounts/${accountId}`} label={t("transactions.backToAccount")} />
      <h1>{isEdit ? t("transactions.edit.heading") : t("transactions.new.heading")}</h1>
      <div className="pw-detail-lede">{t("transactions.form.lede")}</div>
      <input name="accountId" type="hidden" value={accountId} />
      {isEdit ? <input name="transactionId" type="hidden" value={initialValues.transactionId} /> : null}
      {returnTo ? <input name="returnTo" type="hidden" value={returnTo} /> : null}
      {isEdit ? null : <input name="idempotencyKey" type="hidden" value={idempotencyKey} />}
      {state.formError ? (
        <p className="pw-banner-error" role="alert">
          {text(state.formError)}
        </p>
      ) : null}
      <div className="pw-field">
        <span className="pw-field-legend" id="transaction-kind-label">
          {t("transactions.form.typeLabel")}
          <RequiredMark />
        </span>
        <SegmentedControl
          name="kind"
          aria-label={t("transactions.form.typeLabel")}
          value={kind}
          options={kindOptions}
          onChange={(next) => handleKindChange(next as TransactionKind)}
        />
      </div>
      <SheetSelect
        id="transaction-category"
        name="category"
        label={t("transactions.form.categoryLabel")}
        value={category}
        options={categories.map((option) => ({
          value: option,
          label: t(`category.${option}`)
        }))}
        onChange={setCategory}
        required
        invalid={Boolean(state.fieldErrors?.category)}
        errorId={state.fieldErrors?.category ? "transaction-category-error" : undefined}
        error={state.fieldErrors?.category ? text(state.fieldErrors.category) : undefined}
      />
      <div className="pw-field">
        <label htmlFor="transaction-amount">
          {t("transactions.form.amountLabel", { currency: currencyCode })}
          <RequiredMark />
        </label>
        <DecimalInput
          id="transaction-amount"
          name="amount"
          placeholder="0.00"
          required
          defaultValue={state.values?.amount ?? initialValues?.amount ?? ""}
          aria-invalid={state.fieldErrors?.amount ? true : undefined}
          aria-describedby={state.fieldErrors?.amount ? "transaction-amount-error" : undefined}
        />
        {state.fieldErrors?.amount ? (
          <p className="pw-field-error" id="transaction-amount-error" role="alert">
            {text(state.fieldErrors.amount)}
          </p>
        ) : null}
      </div>
      <div className="pw-field">
        <label htmlFor="transaction-description">
          {t("transactions.form.descriptionLabel")}
          <RequiredMark />
        </label>
        <input
          id="transaction-description"
          name="description"
          type="text"
          required
          maxLength={TEXT_FIELD_MAX_LENGTH}
          defaultValue={state.values?.description ?? initialValues?.description ?? ""}
          aria-invalid={state.fieldErrors?.description ? true : undefined}
          aria-describedby={
            state.fieldErrors?.description ? "transaction-description-error" : undefined
          }
        />
        {state.fieldErrors?.description ? (
          <p className="pw-field-error" id="transaction-description-error" role="alert">
            {text(state.fieldErrors.description)}
          </p>
        ) : null}
      </div>
      <div className="pw-field">
        <label htmlFor="transaction-occurred-at">
          {t("transactions.form.occurredAtLabel")}
          <RequiredMark />
        </label>
        <input
          id="transaction-occurred-at"
          name="occurredAt"
          type="datetime-local"
          required
          defaultValue={
            state.values?.occurredAt ?? initialValues?.occurredAt ?? toDatetimeLocalValue(new Date())
          }
          aria-invalid={state.fieldErrors?.occurredAt ? true : undefined}
          aria-describedby={
            state.fieldErrors?.occurredAt ? "transaction-occurred-at-error" : undefined
          }
        />
        {state.fieldErrors?.occurredAt ? (
          <p className="pw-field-error" id="transaction-occurred-at-error" role="alert">
            {text(state.fieldErrors.occurredAt)}
          </p>
        ) : null}
      </div>
      <button className="pw-button" type="submit" disabled={pending}>
        {pending ? t("common.saving") : t("transactions.form.submit")}
      </button>
    </form>
  );
}
