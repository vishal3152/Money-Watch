"use client";

import { useActionState, useState } from "react";

import {
  createStockTransaction,
  type StockTransactionFormState
} from "@/app/share-trading-accounts/[id]/stock-transactions/new/actions";
import { updateStockTransaction } from "@/app/share-trading-accounts/[id]/stock-transactions/[stockTransactionId]/edit/actions";
import { BackLink } from "@/app/components/back-link";
import { DecimalInput } from "@/app/components/decimal-input";
import { RequiredMark } from "@/app/components/required-mark";
import { SegmentedControl } from "@/app/components/segmented-control";
import { toDatetimeLocalValue } from "@/app/datetime-local";
import { TEXT_FIELD_MAX_LENGTH } from "@/app/form-limits";
import type { StockTransactionType } from "@/domain/stock-transaction";
import { useTranslator } from "@/i18n/client";

const initialState: StockTransactionFormState = {};

function initialType(
  values: Record<string, string> | undefined,
  fallback: StockTransactionType = "Buy"
): StockTransactionType {
  if (values?.type === "Buy" || values?.type === "Sell") {
    return values.type;
  }
  return fallback;
}

export type StockTransactionFormInitialValues = {
  stockTransactionId: string;
  type: StockTransactionType;
  scripCode: string;
  quantity: string;
  price: string;
  description: string;
  occurredAt: string;
};

export function StockTransactionForm({
  shareTradingAccountId,
  currencyCode,
  initialValues
}: {
  shareTradingAccountId: string;
  currencyCode: string;
  initialValues?: StockTransactionFormInitialValues;
}) {
  const { t, text } = useTranslator();
  const typeOptions = [
    { value: "Buy", label: t("stockTransactionType.Buy") },
    { value: "Sell", label: t("stockTransactionType.Sell") }
  ];
  const isEdit = initialValues !== undefined;
  const [state, formAction, pending] = useActionState(
    isEdit ? updateStockTransaction : createStockTransaction,
    initialState
  );
  // Regenerated whenever the form remounts (a fresh /new navigation, or the
  // formKey-forced remount after a validation error) — same pattern as
  // TransactionForm's idempotencyKey. Edit mode omits it: updateStockTransaction
  // never claims one, matching updateTransaction.
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [type, setType] = useState<StockTransactionType>(() =>
    initialType(state.values, initialValues?.type ?? "Buy")
  );

  return (
    <form key={state.formKey ?? "new"} className="pw-card" action={formAction} noValidate>
      <BackLink href={`/share-trading-accounts/${shareTradingAccountId}`} label={t("transactions.backToAccount")} />
      <h1>{isEdit ? t("stockTransactions.edit.heading") : t("stockTransactions.new.heading")}</h1>
      <input name="shareTradingAccountId" type="hidden" value={shareTradingAccountId} />
      {isEdit ? (
        <input name="stockTransactionId" type="hidden" value={initialValues.stockTransactionId} />
      ) : (
        <input name="idempotencyKey" type="hidden" value={idempotencyKey} />
      )}
      {state.formError ? (
        <p className="pw-banner-error" role="alert">
          {text(state.formError)}
        </p>
      ) : null}
      <div className="pw-field">
        <span className="pw-field-legend" id="stock-transaction-type-label">
          {t("stockTransactions.form.typeLabel")}
          <RequiredMark />
        </span>
        <SegmentedControl
          name="type"
          aria-label={t("stockTransactions.form.typeLabel")}
          value={type}
          options={typeOptions}
          onChange={(next) => setType(next as StockTransactionType)}
        />
      </div>
      <div className="pw-field">
        <label htmlFor="stock-transaction-scrip-code">
          {t("stockTransactions.form.scripCodeLabel")}
          <RequiredMark />
        </label>
        <input
          id="stock-transaction-scrip-code"
          name="scripCode"
          type="text"
          required
          maxLength={TEXT_FIELD_MAX_LENGTH}
          autoCapitalize="characters"
          autoComplete="off"
          placeholder={t("stockTransactions.form.scripCodePlaceholder")}
          defaultValue={state.values?.scripCode ?? initialValues?.scripCode ?? ""}
          aria-invalid={state.fieldErrors?.scripCode ? true : undefined}
          aria-describedby={state.fieldErrors?.scripCode ? "stock-transaction-scrip-code-error" : undefined}
        />
        {state.fieldErrors?.scripCode ? (
          <p className="pw-field-error" id="stock-transaction-scrip-code-error" role="alert">
            {text(state.fieldErrors.scripCode)}
          </p>
        ) : null}
      </div>
      <div className="pw-field">
        <label htmlFor="stock-transaction-quantity">
          {t("stockTransactions.form.quantityLabel")}
          <RequiredMark />
        </label>
        <DecimalInput
          id="stock-transaction-quantity"
          name="quantity"
          placeholder="0"
          required
          defaultValue={state.values?.quantity ?? initialValues?.quantity ?? ""}
          aria-invalid={state.fieldErrors?.quantity ? true : undefined}
          aria-describedby={state.fieldErrors?.quantity ? "stock-transaction-quantity-error" : undefined}
        />
        {state.fieldErrors?.quantity ? (
          <p className="pw-field-error" id="stock-transaction-quantity-error" role="alert">
            {text(state.fieldErrors.quantity)}
          </p>
        ) : null}
      </div>
      <div className="pw-field">
        <label htmlFor="stock-transaction-price">
          {t("stockTransactions.form.priceLabel", { currency: currencyCode })}
          <RequiredMark />
        </label>
        <DecimalInput
          id="stock-transaction-price"
          name="price"
          placeholder="0.00"
          required
          defaultValue={state.values?.price ?? initialValues?.price ?? ""}
          aria-invalid={state.fieldErrors?.price ? true : undefined}
          aria-describedby={state.fieldErrors?.price ? "stock-transaction-price-error" : undefined}
        />
        {state.fieldErrors?.price ? (
          <p className="pw-field-error" id="stock-transaction-price-error" role="alert">
            {text(state.fieldErrors.price)}
          </p>
        ) : null}
      </div>
      <div className="pw-field">
        <label htmlFor="stock-transaction-description">
          {t("stockTransactions.form.descriptionLabel")}
          <RequiredMark />
        </label>
        <input
          id="stock-transaction-description"
          name="description"
          type="text"
          required
          maxLength={TEXT_FIELD_MAX_LENGTH}
          defaultValue={state.values?.description ?? initialValues?.description ?? ""}
          aria-invalid={state.fieldErrors?.description ? true : undefined}
          aria-describedby={
            state.fieldErrors?.description ? "stock-transaction-description-error" : undefined
          }
        />
        {state.fieldErrors?.description ? (
          <p className="pw-field-error" id="stock-transaction-description-error" role="alert">
            {text(state.fieldErrors.description)}
          </p>
        ) : null}
      </div>
      <div className="pw-field">
        <label htmlFor="stock-transaction-occurred-at">
          {t("stockTransactions.form.occurredAtLabel")}
          <RequiredMark />
        </label>
        <input
          id="stock-transaction-occurred-at"
          name="occurredAt"
          type="datetime-local"
          required
          defaultValue={
            state.values?.occurredAt ?? initialValues?.occurredAt ?? toDatetimeLocalValue(new Date())
          }
          aria-invalid={state.fieldErrors?.occurredAt ? true : undefined}
          aria-describedby={
            state.fieldErrors?.occurredAt ? "stock-transaction-occurred-at-error" : undefined
          }
        />
        {state.fieldErrors?.occurredAt ? (
          <p className="pw-field-error" id="stock-transaction-occurred-at-error" role="alert">
            {text(state.fieldErrors.occurredAt)}
          </p>
        ) : null}
      </div>
      <button className="pw-button" type="submit" disabled={pending}>
        {pending ? t("common.saving") : t("stockTransactions.form.submit")}
      </button>
    </form>
  );
}
