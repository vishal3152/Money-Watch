"use server";

import { redirect } from "next/navigation";

import { claimIdempotencyKey } from "@/app/duplicate-submission-guard";
import { withPersistedFormState } from "@/app/form-persistence";
import { textFieldLengthError } from "@/app/form-limits";
import {
  DatabaseConstraintError,
  FixedDepositTransferError,
  TransferCurrencyMismatchError
} from "@/db/errors";
import { getTransferRepository, type RepositoryFactoryDeps } from "@/db/repository-factory";
import { parseDecimalToMinorUnits } from "@/domain/decimal-input";
import { InvalidMinorUnitsError } from "@/domain/money";
import {
  InvalidTransactionTimestampError,
  normalizeTransactionTimestamp
} from "@/domain/transaction";
import {
  assertValidTransferPurpose,
  assertValidTransferLegs,
  assertValidTransferAmounts,
  InvalidTransferLegsError,
  InvalidTransferPurposeError,
  InvalidTransferAmountsError,
  type Transfer
} from "@/domain/transfer";
import { domainErrorText } from "@/app/domain-error-text";
import type { LocalizedText } from "@/i18n/translator";

export type TransferFormState = {
  fieldErrors?: {
    sourceAmount?: LocalizedText;
    destinationAmount?: LocalizedText;
    occurredAt?: LocalizedText;
    description?: LocalizedText;
  };
  formError?: LocalizedText;
  values?: Record<string, string>;
  formKey?: string;
};

export type CreateTransferDeps = RepositoryFactoryDeps & {
  redirectTo?: (path: string) => void;
  newId?: () => string;
};

function optionalId(value: FormDataEntryValue | null) {
  const id = String(value ?? "");
  return id.length > 0 ? id : null;
}

function inferTransferPurpose(transfer: Pick<Transfer, "sourceFixedDepositId" | "destinationFixedDepositId">) {
  if (transfer.sourceFixedDepositId) {
    return "fixed-deposit-withdrawal" as const;
  }
  if (transfer.destinationFixedDepositId) {
    return "fixed-deposit-top-up" as const;
  }
  return "general" as const;
}

export async function createTransfer(
  _prevState: TransferFormState,
  formData: FormData,
  deps: CreateTransferDeps = {}
): Promise<TransferFormState> {
  const fail = (state: Omit<TransferFormState, "values" | "formKey">) =>
    withPersistedFormState(formData, state);
  const id = (deps.newId ?? (() => crypto.randomUUID()))();
  const sourceCurrencyCode = String(formData.get("sourceCurrencyCode") ?? "");
  const destinationCurrencyCode = String(formData.get("destinationCurrencyCode") ?? "");
  const transfer: Transfer = {
    id,
    sourceAccountId: optionalId(formData.get("sourceAccountId")),
    sourceFixedDepositId: optionalId(formData.get("sourceFixedDepositId")),
    sourceAmountMinor: 0,
    sourceCurrencyCode,
    destinationAccountId: optionalId(formData.get("destinationAccountId")),
    destinationFixedDepositId: optionalId(formData.get("destinationFixedDepositId")),
    destinationAmountMinor: 0,
    destinationCurrencyCode,
    occurredAt: String(formData.get("occurredAt") ?? ""),
    description: String(formData.get("description") ?? "").trim(),
    purpose: "general"
  };
  if (transfer.description.length === 0) {
    return fail({ fieldErrors: { description: { key: "errors.descriptionRequired" } } });
  }
  const descriptionLengthError = textFieldLengthError(transfer.description);
  if (descriptionLengthError) {
    return fail({ fieldErrors: { description: descriptionLengthError } });
  }
  const requestedPurpose = String(formData.get("purpose") ?? "").trim();
  transfer.purpose =
    requestedPurpose.length > 0
      ? (requestedPurpose as Transfer["purpose"])
      : inferTransferPurpose(transfer);

  try {
    assertValidTransferLegs(transfer);
    assertValidTransferPurpose(transfer);
  } catch (error) {
    if (error instanceof InvalidTransferLegsError || error instanceof InvalidTransferPurposeError) {
      return fail({ formError: domainErrorText(error) });
    }
    throw error;
  }

  try {
    transfer.occurredAt = normalizeTransactionTimestamp(transfer.occurredAt);
  } catch (error) {
    if (error instanceof InvalidTransactionTimestampError) {
      return fail({ fieldErrors: { occurredAt: { key: "errors.timestampInvalid" } } });
    }
    throw error;
  }

  try {
    transfer.sourceAmountMinor = parseDecimalToMinorUnits(
      String(formData.get("sourceAmount") ?? ""),
      sourceCurrencyCode
    );
  } catch (error) {
    if (error instanceof InvalidMinorUnitsError) {
      return fail({ fieldErrors: { sourceAmount: { key: "errors.sourceAmountInvalid" } } });
    }
    throw error;
  }

  try {
    transfer.destinationAmountMinor = parseDecimalToMinorUnits(
      String(formData.get("destinationAmount") ?? ""),
      destinationCurrencyCode
    );
  } catch (error) {
    if (error instanceof InvalidMinorUnitsError) {
      return fail({ fieldErrors: { destinationAmount: { key: "errors.destinationAmountInvalid" } } });
    }
    throw error;
  }

  try {
    assertValidTransferAmounts(transfer);
  } catch (error) {
    if (error instanceof InvalidTransferAmountsError) {
      return fail({ formError: domainErrorText(error) });
    }
    throw error;
  }

  const idempotencyKey = String(formData.get("idempotencyKey") ?? "");
  if (!claimIdempotencyKey(idempotencyKey)) {
    return fail({ formError: { key: "errors.transferDuplicateSubmission" } });
  }

  try {
    await (await getTransferRepository(deps)).create(transfer);
  } catch (error) {
    if (error instanceof FixedDepositTransferError || error instanceof TransferCurrencyMismatchError) {
      return fail({ formError: domainErrorText(error) });
    }
    if (error instanceof DatabaseConstraintError) {
      return fail({ formError: { key: "errors.transferLegMissing" } });
    }
    throw error;
  }

  (deps.redirectTo ?? redirect)(`/transfers/${id}?message=transfer_created`);
  return {};
}
