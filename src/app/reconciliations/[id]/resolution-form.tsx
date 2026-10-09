"use client";

import { useActionState, useState } from "react";

import {
  resolveDiscrepancy,
  type ResolveDiscrepancyFormState
} from "@/app/reconciliations/[id]/resolve-actions";
import { DecimalInput } from "@/app/components/decimal-input";
import { RequiredMark } from "@/app/components/required-mark";
import { SegmentedControl } from "@/app/components/segmented-control";
import { TEXT_FIELD_MAX_LENGTH } from "@/app/form-limits";
import { useTranslator } from "@/i18n/client";

const initialState: ResolveDiscrepancyFormState = {};

export function ResolutionForm({
  reconciliationId,
  discrepancyId,
  defaultAmount
}: {
  reconciliationId: string;
  discrepancyId: string;
  defaultAmount: string;
}) {
  const { t, text } = useTranslator();
  const resolutionOptions = [
    { value: "disputed-with-bank", label: t("reconciliations.form.optionDisputed") },
    { value: "corrected-my-record", label: t("reconciliations.form.optionCorrect") }
  ];
  const [state, formAction, pending] = useActionState(resolveDiscrepancy, initialState);
  const [resolution, setResolution] = useState(
    () => state.values?.resolution ?? "disputed-with-bank"
  );

  return (
    <form key={state.formKey ?? "new"} className="pw-resolution-form" action={formAction} noValidate>
      <input name="reconciliationId" type="hidden" value={reconciliationId} />
      <input name="discrepancyId" type="hidden" value={discrepancyId} />
      {state.formError ? (
        <p className="pw-banner-error" role="alert">
          {text(state.formError)}
        </p>
      ) : null}
      <div className="pw-field">
        <span className="pw-field-legend">
          {t("reconciliations.form.resolutionLabel")}
          <RequiredMark />
        </span>
        <p className="pw-field-help">{t("reconciliations.form.resolutionHelp")}</p>
        <SegmentedControl
          name="resolution"
          aria-label={t("reconciliations.form.resolutionLabel")}
          value={resolution}
          options={resolutionOptions}
          onChange={setResolution}
        />
      </div>
      {resolution === "corrected-my-record" ? (
        <>
          <div className="pw-field">
            <label htmlFor="adjustment-amount">
              {t("reconciliations.form.amountLabel")}
              <RequiredMark />
            </label>
            <DecimalInput
              id="adjustment-amount"
              name="amount"
              allowNegative
              defaultValue={state.values?.amount ?? defaultAmount}
              required
              aria-invalid={state.fieldErrors?.amount ? true : undefined}
              aria-describedby={
                state.fieldErrors?.amount ? "adjustment-amount-error" : undefined
              }
            />
            {state.fieldErrors?.amount ? (
              <p className="pw-field-error" id="adjustment-amount-error" role="alert">
                {text(state.fieldErrors.amount)}
              </p>
            ) : null}
          </div>
          <div className="pw-field">
            <label htmlFor="adjustment-description">
              {t("reconciliations.form.descriptionLabel")}
              <RequiredMark />
            </label>
            <input
              id="adjustment-description"
              name="description"
              required
              maxLength={TEXT_FIELD_MAX_LENGTH}
              defaultValue={state.values?.description ?? ""}
              aria-invalid={state.fieldErrors?.description ? true : undefined}
              aria-describedby={
                state.fieldErrors?.description ? "adjustment-description-error" : undefined
              }
            />
            {state.fieldErrors?.description ? (
              <p className="pw-field-error" id="adjustment-description-error" role="alert">
                {text(state.fieldErrors.description)}
              </p>
            ) : null}
          </div>
        </>
      ) : null}
      <button className="pw-button" type="submit" disabled={pending}>
        {pending ? t("reconciliations.form.resolving") : t("reconciliations.form.submit")}
      </button>
    </form>
  );
}
