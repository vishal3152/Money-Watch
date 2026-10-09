"use client";

import { useActionState, useId, useState } from "react";

import { DecimalInput } from "@/app/components/decimal-input";
import { RequiredMark } from "@/app/components/required-mark";
import { SegmentedControl } from "@/app/components/segmented-control";
import { SheetSelect, type SheetSelectOption } from "@/app/components/sheet-select";
import { TEXT_FIELD_MAX_LENGTH } from "@/app/form-limits";
import {
  resolveUnresolvedEmailAlertAction,
  type ResolveUnresolvedEmailAlertState
} from "@/app/imports/resolve-unresolved-email-alert-actions";
import type { EmailAlertDraft } from "@/domain/email-alert";
import { useTranslator } from "@/i18n/client";
import type { LocalizedText } from "@/i18n/translator";

const initialState: ResolveUnresolvedEmailAlertState = {};

/**
 * Correct whatever the LLM got wrong and import the alert onto an Account, in place on `/imports`
 * (docs/specs/email-alert-sync.md). Fields the poll flagged start marked so the owner can see what
 * needs attention without reading the whole alert; everything else is pre-filled from the alert and
 * still editable.
 */
export function ResolveUnresolvedEmailAlertForm({
  alertId,
  draft,
  invalidFields,
  accountOptions
}: {
  alertId: string;
  draft: EmailAlertDraft;
  invalidFields: readonly string[];
  accountOptions: readonly SheetSelectOption[];
}) {
  const { t, text } = useTranslator();
  const directionOptions = [
    { value: "credit", label: t("imports.alertForm.moneyIn") },
    { value: "debit", label: t("imports.alertForm.moneyOut") }
  ];
  const [state, formAction, pending] = useActionState(resolveUnresolvedEmailAlertAction, initialState);
  // Seeded from the submitted values, not just the draft: React 19 remounts this form on a
  // validation failure (see form-persistence.ts), and the owner must not have to pick the Account
  // or direction again to fix one field.
  const [accountId, setAccountId] = useState(() => state.values?.accountId ?? "");
  const [direction, setDirection] = useState(() => {
    const submitted = state.values?.direction ?? draft.direction;
    return submitted === "debit" ? "debit" : "credit";
  });
  const fieldId = useId();
  const flagged = new Set(invalidFields);

  function fieldError(field: string): LocalizedText | undefined {
    return (
      state.fieldErrors?.[field] ??
      (flagged.has(field) ? { key: "imports.alertForm.unreadField" } : undefined)
    );
  }

  function describedBy(field: string): string | undefined {
    return fieldError(field) ? `${fieldId}-${field}-error` : undefined;
  }

  function FieldError({ field }: { field: string }) {
    const message = fieldError(field);
    return message ? (
      <p className="pw-field-error" id={`${fieldId}-${field}-error`} role="alert">
        {text(message)}
      </p>
    ) : null;
  }

  return (
    <form
      key={state.formKey ?? alertId}
      className="pw-unresolved-alert-resolve"
      action={formAction}
      noValidate
    >
      <input type="hidden" name="alertId" value={alertId} />
      {state.formError ? (
        <p className="pw-banner-error" role="alert">
          {text(state.formError)}
        </p>
      ) : null}
      <SheetSelect
        id={`${fieldId}-account`}
        name="accountId"
        label={t("imports.alertForm.accountLabel")}
        value={accountId}
        options={accountOptions}
        onChange={setAccountId}
        required
        invalid={Boolean(state.fieldErrors?.accountId)}
        errorId={state.fieldErrors?.accountId ? `${fieldId}-accountId-error` : undefined}
        error={state.fieldErrors?.accountId ? text(state.fieldErrors.accountId) : undefined}
      />
      <div className="pw-field">
        <span className="pw-field-legend" id={`${fieldId}-direction-label`}>
          {t("imports.alertForm.directionLabel")}
          <RequiredMark />
        </span>
        <SegmentedControl
          name="direction"
          aria-label={t("imports.alertForm.directionLabel")}
          value={direction}
          options={directionOptions}
          onChange={setDirection}
        />
        <FieldError field="direction" />
      </div>
      <div className="pw-field">
        <label htmlFor={`${fieldId}-amount`}>
          {t("imports.alertForm.amountLabel")}
          <RequiredMark />
        </label>
        <DecimalInput
          id={`${fieldId}-amount`}
          name="amount"
          placeholder="0.00"
          required
          defaultValue={state.values?.amount ?? draft.amount ?? ""}
          aria-invalid={fieldError("amount") ? true : undefined}
          aria-describedby={describedBy("amount")}
        />
        <FieldError field="amount" />
      </div>
      <div className="pw-field">
        <label htmlFor={`${fieldId}-currency`}>
          {t("imports.alertForm.currencyLabel")}
          <RequiredMark />
        </label>
        <input
          id={`${fieldId}-currency`}
          name="currencyCode"
          type="text"
          required
          maxLength={3}
          autoCapitalize="characters"
          autoComplete="off"
          placeholder="INR"
          defaultValue={state.values?.currencyCode ?? draft.currencyCode ?? ""}
          aria-invalid={fieldError("currencyCode") ? true : undefined}
          aria-describedby={describedBy("currencyCode")}
        />
        <FieldError field="currencyCode" />
      </div>
      <div className="pw-field">
        <label htmlFor={`${fieldId}-occurred-at`}>
          {t("imports.alertForm.dateLabel")}
          <RequiredMark />
        </label>
        <input
          id={`${fieldId}-occurred-at`}
          name="occurredAt"
          type="date"
          required
          defaultValue={state.values?.occurredAt ?? draft.occurredAt ?? ""}
          aria-invalid={fieldError("occurredAt") ? true : undefined}
          aria-describedby={describedBy("occurredAt")}
        />
        <FieldError field="occurredAt" />
      </div>
      <div className="pw-field">
        <label htmlFor={`${fieldId}-description`}>
          {t("imports.alertForm.descriptionLabel")}
          <RequiredMark />
        </label>
        <input
          id={`${fieldId}-description`}
          name="description"
          type="text"
          required
          maxLength={TEXT_FIELD_MAX_LENGTH}
          defaultValue={state.values?.description ?? draft.description ?? ""}
          aria-invalid={fieldError("description") ? true : undefined}
          aria-describedby={describedBy("description")}
        />
        <FieldError field="description" />
      </div>
      <button className="pw-button" type="submit" disabled={pending || !accountId}>
        {pending ? t("imports.alertForm.importing") : t("imports.alertForm.submit")}
      </button>
    </form>
  );
}
