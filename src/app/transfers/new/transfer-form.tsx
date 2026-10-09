"use client";

import { useActionState, useEffect, useRef, useState } from "react";

import { createTransfer, type TransferFormState } from "@/app/transfers/new/actions";
import { updateTransfer } from "@/app/transfers/[id]/edit/actions";
import { nextDestinationAmountOnCurrencyChange } from "@/app/transfers/new/transfer-amount-sync";
import { BackLink } from "@/app/components/back-link";
import { DecimalInput } from "@/app/components/decimal-input";
import { RequiredMark } from "@/app/components/required-mark";
import { SegmentedControl } from "@/app/components/segmented-control";
import { SheetSelect } from "@/app/components/sheet-select";
import { toDatetimeLocalValue } from "@/app/datetime-local";
import { TEXT_FIELD_MAX_LENGTH } from "@/app/form-limits";
import { formatFixedDepositLabel } from "@/app/format-fixed-deposit";
import type { Account } from "@/domain/account";
import type { FixedDeposit } from "@/domain/fixed-deposit";
import type { Institution } from "@/domain/institution";
import type { TransferPurpose } from "@/domain/transfer";
import { useTranslator } from "@/i18n/client";

const initialState: TransferFormState = {};

export type TransferFormEditing = {
  transferId: string;
  sourceAmount: string;
  destinationAmount: string;
  description: string;
  occurredAt: string;
};

export function TransferForm({
  accounts,
  fixedDeposits,
  institutions,
  initialSourceType,
  initialSourceId,
  initialDestinationType,
  initialDestinationId,
  initialPurpose,
  editing
}: {
  accounts: Account[];
  fixedDeposits: FixedDeposit[];
  institutions: Institution[];
  initialSourceType: "account" | "fixedDeposit";
  initialSourceId: string;
  initialDestinationType: "account" | "fixedDeposit";
  initialDestinationId: string;
  initialPurpose: TransferPurpose | "";
  editing?: TransferFormEditing;
}) {
  const { t, text } = useTranslator();
  const entityTypeOptions = [
    { value: "account", label: t("transfers.form.entityAccount") },
    { value: "fixedDeposit", label: t("transfers.form.entityFixedDeposit") }
  ];
  const [state, formAction, pending] = useActionState(
    editing ? updateTransfer : createTransfer,
    initialState
  );
  // Regenerated whenever the form remounts (a fresh `/new` navigation, or the
  // formKey-forced remount after a validation error) so a genuine resubmission
  // never collides with an earlier failed attempt's key.
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [sourceType, setSourceType] = useState<"account" | "fixedDeposit">(initialSourceType);
  const [sourceId, setSourceId] = useState(initialSourceId);
  const [destinationType, setDestinationType] =
    useState<"account" | "fixedDeposit">(initialDestinationType);
  const [destinationId, setDestinationId] = useState(initialDestinationId);
  const [sourceAmount, setSourceAmount] = useState(
    () => state.values?.sourceAmount ?? editing?.sourceAmount ?? ""
  );
  const [destinationAmount, setDestinationAmount] = useState(
    () => state.values?.destinationAmount ?? editing?.destinationAmount ?? ""
  );
  const recordingOpeningDebit = !editing && initialPurpose === "fixed-deposit-opening";
  const sourceFixedDeposit = fixedDeposits.find((item) => item.id === sourceId);
  const sourceAccount = accounts.find((item) => item.id === sourceId);
  const sourceCurrencyCode =
    sourceType === "account" ? sourceAccount?.currencyCode ?? "" : sourceFixedDeposit?.currencyCode ?? "";
  const effectiveDestinationId =
    sourceType === "fixedDeposit"
      ? sourceFixedDeposit?.linkedAccountId ?? ""
      : destinationId;
  const destinationAccount = accounts.find((item) => item.id === effectiveDestinationId);
  const destinationFixedDeposit = fixedDeposits.find((item) => item.id === effectiveDestinationId);
  const destinationCurrencyCode =
    sourceType === "fixedDeposit" || destinationType === "account"
      ? destinationAccount?.currencyCode ?? ""
      : destinationFixedDeposit?.currencyCode ?? "";
  const sameCurrency =
    sourceCurrencyCode.length > 0 && sourceCurrencyCode === destinationCurrencyCode;
  const wasSameCurrencyRef = useRef(sameCurrency);
  useEffect(() => {
    setDestinationAmount((current) =>
      nextDestinationAmountOnCurrencyChange(wasSameCurrencyRef.current, sameCurrency, current)
    );
    wasSameCurrencyRef.current = sameCurrency;
  }, [sameCurrency]);
  const effectivePurpose: TransferPurpose =
    sourceType === "fixedDeposit"
      ? "fixed-deposit-withdrawal"
      : destinationType === "fixedDeposit"
        ? recordingOpeningDebit
          ? "fixed-deposit-opening"
          : "fixed-deposit-top-up"
        : "general";

  const institutionNameById = new Map(institutions.map((item) => [item.id, item.name]));
  const accountOptionLabel = (account: Account) =>
    `${account.name} · ${institutionNameById.get(account.institutionId) ?? t("transfers.form.unknownInstitution")}`;
  const fixedDepositOptionLabel = (fixedDeposit: FixedDeposit) =>
    `${formatFixedDepositLabel(fixedDeposit, t)} · ${institutionNameById.get(fixedDeposit.institutionId) ?? t("transfers.form.unknownInstitution")}`;

  // Source and destination can only collide on the same id when they draw from
  // the same list (both Account, since a FixedDeposit source always forces an
  // Account destination — see handleSourceTypeChange). When they do, each side's
  // sheet excludes whatever the other side currently holds, so picking the same
  // Account for both is not offered rather than caught only after Save.
  const effectiveDestinationType = sourceType === "fixedDeposit" ? "account" : destinationType;
  const canCollide = sourceType === effectiveDestinationType;

  const sourceOptionsAll =
    sourceType === "account"
      ? accounts.map((item) => ({ value: item.id, label: accountOptionLabel(item) }))
      : fixedDeposits.map((item) => ({
          value: item.id,
          label: fixedDepositOptionLabel(item)
        }));
  const destinationOptionsAll =
    destinationType === "account" || sourceType === "fixedDeposit"
      ? accounts.map((item) => ({ value: item.id, label: accountOptionLabel(item) }))
      : fixedDeposits.map((item) => ({
          value: item.id,
          label: fixedDepositOptionLabel(item)
        }));
  const sourceOptions = canCollide
    ? sourceOptionsAll.filter((option) => option.value !== effectiveDestinationId)
    : sourceOptionsAll;
  const destinationOptions = canCollide
    ? destinationOptionsAll.filter((option) => option.value !== sourceId)
    : destinationOptionsAll;

  function firstIdOtherThan(options: { value: string }[], excludeId: string) {
    return options.find((option) => option.value !== excludeId)?.value ?? options[0]?.value ?? "";
  }

  function handleSourceTypeChange(type: "account" | "fixedDeposit") {
    setSourceType(type);
    const candidates = type === "account" ? accounts : fixedDeposits;
    setSourceId(
      type === effectiveDestinationType
        ? firstIdOtherThan(candidates.map((item) => ({ value: item.id })), destinationId)
        : candidates[0]?.id ?? ""
    );
    if (type === "fixedDeposit") {
      setDestinationType("account");
    }
  }

  function handleDestinationTypeChange(type: "account" | "fixedDeposit") {
    setDestinationType(type);
    const candidates = type === "account" ? accounts : fixedDeposits;
    setDestinationId(
      type === sourceType
        ? firstIdOtherThan(candidates.map((item) => ({ value: item.id })), sourceId)
        : candidates[0]?.id ?? ""
    );
  }

  function handleSourceAmountChange(next: string) {
    setSourceAmount(next);
    if (sameCurrency) {
      setDestinationAmount(next);
    }
  }

  return (
    <form key={state.formKey ?? "new"} className="pw-card" action={formAction} noValidate>
      <BackLink
        href={editing ? `/transfers/${editing.transferId}` : "/"}
        label={editing ? t("transfers.backToTransfer") : t("common.backToDashboard")}
      />
      <h1>
        {editing
          ? t("transfers.edit.heading")
          : recordingOpeningDebit
            ? t("transfers.openingDebit.heading")
            : t("transfers.new.heading")}
      </h1>
      {editing ? <input name="transferId" type="hidden" value={editing.transferId} /> : null}
      {editing ? null : <input name="idempotencyKey" type="hidden" value={idempotencyKey} />}
      {recordingOpeningDebit ? (
        <p className="pw-detail-lede">{t("transfers.openingDebit.lede")}</p>
      ) : null}
      {state.formError ? (
        <p className="pw-banner-error" role="alert">
          {text(state.formError)}
        </p>
      ) : null}

      <fieldset className="pw-fieldset">
        <legend>{t("transfers.form.source")}</legend>
        <div className="pw-field">
          <span className="pw-field-legend">
            {t("transfers.form.typeLabel")}
            <RequiredMark />
          </span>
          <SegmentedControl
            aria-label={t("transfers.form.sourceType")}
            value={sourceType}
            options={entityTypeOptions}
            disabled={recordingOpeningDebit}
            onChange={(next) => handleSourceTypeChange(next as "account" | "fixedDeposit")}
          />
        </div>
        <SheetSelect
          id="transfer-source"
          label={t("transfers.form.from")}
          value={sourceId}
          options={sourceOptions}
          onChange={setSourceId}
          required
        />
        <input
          name="sourceAccountId"
          type="hidden"
          value={sourceType === "account" ? sourceId : ""}
        />
        <input
          name="sourceFixedDepositId"
          type="hidden"
          value={sourceType === "fixedDeposit" ? sourceId : ""}
        />
        <div className="pw-field">
          <label htmlFor="transfer-source-amount">
            {t("transfers.form.amountLabel")}
            <RequiredMark />
          </label>
          <DecimalInput
            id="transfer-source-amount"
            name="sourceAmount"
            required
            value={sourceAmount}
            onValueChange={handleSourceAmountChange}
          />
          {state.fieldErrors?.sourceAmount ? (
            <p className="pw-field-error" role="alert">
              {text(state.fieldErrors.sourceAmount)}
            </p>
          ) : null}
        </div>
        <div className="pw-field">
          <label htmlFor="transfer-source-currency">
            {t("transfers.form.currencyLabel")}
            <RequiredMark />
          </label>
          <input
            id="transfer-source-currency"
            name="sourceCurrencyCode"
            value={sourceCurrencyCode}
            readOnly
            required
          />
        </div>
      </fieldset>

      <fieldset className="pw-fieldset">
        <legend>{t("transfers.form.destination")}</legend>
        <div className="pw-field">
          <span className="pw-field-legend">
            {t("transfers.form.typeLabel")}
            <RequiredMark />
          </span>
          <SegmentedControl
            aria-label={t("transfers.form.destinationType")}
            value={sourceType === "fixedDeposit" ? "account" : destinationType}
            options={entityTypeOptions}
            disabled={sourceType === "fixedDeposit" || recordingOpeningDebit}
            onChange={(next) => handleDestinationTypeChange(next as "account" | "fixedDeposit")}
          />
        </div>
        <SheetSelect
          id="transfer-destination"
          label={t("transfers.form.to")}
          value={effectiveDestinationId}
          options={destinationOptions}
          onChange={setDestinationId}
          disabled={sourceType === "fixedDeposit" || recordingOpeningDebit}
          required
        />
        <input
          name="destinationAccountId"
          type="hidden"
          value={
            sourceType === "fixedDeposit" || destinationType === "account"
              ? effectiveDestinationId
              : ""
          }
        />
        <input
          name="destinationFixedDepositId"
          type="hidden"
          value={
            sourceType !== "fixedDeposit" && destinationType === "fixedDeposit"
              ? destinationId
              : ""
          }
        />
        {sameCurrency ? (
          <input name="destinationAmount" type="hidden" value={sourceAmount} />
        ) : (
          <div className="pw-field">
            <label htmlFor="transfer-destination-amount">
              {t("transfers.form.amountLabel")}
              <RequiredMark />
            </label>
            <DecimalInput
              id="transfer-destination-amount"
              name="destinationAmount"
              required
              value={destinationAmount}
              onValueChange={setDestinationAmount}
            />
            {state.fieldErrors?.destinationAmount ? (
              <p className="pw-field-error" role="alert">
                {text(state.fieldErrors.destinationAmount)}
              </p>
            ) : null}
          </div>
        )}
        <div className="pw-field">
          <label htmlFor="transfer-destination-currency">
            {t("transfers.form.currencyLabel")}
            <RequiredMark />
          </label>
          <input
            id="transfer-destination-currency"
            name="destinationCurrencyCode"
            value={destinationCurrencyCode}
            readOnly
            required
          />
        </div>
      </fieldset>

      <div className="pw-field">
        <label htmlFor="transfer-description">
          {t("transfers.form.descriptionLabel")}
          <RequiredMark />
        </label>
        <input
          id="transfer-description"
          name="description"
          required
          maxLength={TEXT_FIELD_MAX_LENGTH}
          defaultValue={state.values?.description ?? editing?.description ?? ""}
          aria-invalid={state.fieldErrors?.description ? true : undefined}
          aria-describedby={
            state.fieldErrors?.description ? "transfer-description-error" : undefined
          }
        />
        {state.fieldErrors?.description ? (
          <p className="pw-field-error" id="transfer-description-error" role="alert">
            {text(state.fieldErrors.description)}
          </p>
        ) : null}
      </div>
      <input name="purpose" type="hidden" value={effectivePurpose} />
      <div className="pw-field">
        <label htmlFor="transfer-occurred-at">
          {t("transfers.form.occurredAtLabel")}
          <RequiredMark />
        </label>
        <input
          id="transfer-occurred-at"
          name="occurredAt"
          type="datetime-local"
          required
          defaultValue={
            state.values?.occurredAt ?? editing?.occurredAt ?? toDatetimeLocalValue(new Date())
          }
          aria-invalid={state.fieldErrors?.occurredAt ? true : undefined}
          aria-describedby={
            state.fieldErrors?.occurredAt ? "transfer-occurred-at-error" : undefined
          }
        />
        {state.fieldErrors?.occurredAt ? (
          <p className="pw-field-error" id="transfer-occurred-at-error" role="alert">
            {text(state.fieldErrors.occurredAt)}
          </p>
        ) : null}
      </div>
      <button className="pw-button" type="submit" disabled={pending}>
        {pending ? t("common.saving") : t("transfers.form.submit")}
      </button>
    </form>
  );
}
