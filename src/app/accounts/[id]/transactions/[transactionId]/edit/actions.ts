"use server";

import { redirect } from "next/navigation";

import { withPersistedFormState } from "@/app/form-persistence";
import { textFieldLengthError } from "@/app/form-limits";
import { resolveReturnTo } from "@/app/return-to";
import { withSystemMessage } from "@/app/components/system-message";
import { TransactionNotEditableError, TransactionNotFoundError } from "@/db/errors";
import {
  getAccountRepository,
  getTransactionRepository,
  type RepositoryFactoryDeps
} from "@/db/repository-factory";
import { parseDecimalToMinorUnits } from "@/domain/decimal-input";
import { InvalidMinorUnitsError } from "@/domain/money";
import {
  InvalidTransactionTimestampError,
  normalizeTransactionTimestamp
} from "@/domain/transaction";
import {
  assertValidCategoryForKind,
  InvalidTransactionCategoryError,
  type TransactionCategory,
  type TransactionKind
} from "@/domain/transaction-category";
import { domainErrorText } from "@/app/domain-error-text";
import type { LocalizedText } from "@/i18n/translator";

export type TransactionEditFormState = {
  fieldErrors?: {
    amount?: LocalizedText;
    occurredAt?: LocalizedText;
    kind?: LocalizedText;
    category?: LocalizedText;
    description?: LocalizedText;
  };
  formError?: LocalizedText;
  values?: Record<string, string>;
  formKey?: string;
};

export type UpdateTransactionDeps = RepositoryFactoryDeps & {
  redirectTo?: (path: string) => void;
};

function isTransactionKind(value: string): value is TransactionKind {
  return value === "Income" || value === "Expense";
}

export async function updateTransaction(
  _prevState: TransactionEditFormState,
  formData: FormData,
  deps: UpdateTransactionDeps = {}
): Promise<TransactionEditFormState> {
  const fail = (state: Omit<TransactionEditFormState, "values" | "formKey">) =>
    withPersistedFormState(formData, state);

  const transactionId = String(formData.get("transactionId") ?? "");
  const accountId = String(formData.get("accountId") ?? "");
  const amount = String(formData.get("amount") ?? "");
  const kindInput = String(formData.get("kind") ?? "");
  const category = String(formData.get("category") ?? "");
  const occurredAtInput = String(formData.get("occurredAt") ?? "");
  const description = String(formData.get("description") ?? "").trim();
  if (description.length === 0) {
    return fail({ fieldErrors: { description: { key: "errors.descriptionRequired" } } });
  }
  const descriptionLengthError = textFieldLengthError(description);
  if (descriptionLengthError) {
    return fail({ fieldErrors: { description: descriptionLengthError } });
  }
  const accounts = await getAccountRepository(deps);
  const account = await accounts.getById(accountId);

  if (!account) {
    return fail({ formError: { key: "errors.accountMissing" } });
  }

  const transactionRepository = await getTransactionRepository(deps);
  const existing = await transactionRepository.getById(transactionId);

  if (!existing || existing.accountId !== accountId) {
    return fail({ formError: { key: "errors.transactionAccountMismatch" } });
  }

  if (!isTransactionKind(kindInput)) {
    return fail({ fieldErrors: { kind: { key: "errors.kindRequired" } } });
  }

  let amountMagnitudeMinor: number;
  try {
    amountMagnitudeMinor = parseDecimalToMinorUnits(amount, account.currencyCode);
  } catch (error) {
    if (error instanceof InvalidMinorUnitsError) {
      return fail({ fieldErrors: { amount: { key: "errors.amountInvalid" } } });
    }
    throw error;
  }

  if (amountMagnitudeMinor < 0) {
    return fail({
      fieldErrors: { amount: { key: "errors.amountMustBePositive" } }
    });
  }

  try {
    assertValidCategoryForKind(kindInput, category);
  } catch (error) {
    if (error instanceof InvalidTransactionCategoryError) {
      return fail({
        fieldErrors: { category: { key: "errors.categoryMismatch" } }
      });
    }
    throw error;
  }

  const amountMinor = kindInput === "Expense" ? -amountMagnitudeMinor : amountMagnitudeMinor;

  let occurredAt: string;
  try {
    occurredAt = normalizeTransactionTimestamp(occurredAtInput);
  } catch (error) {
    if (error instanceof InvalidTransactionTimestampError) {
      return fail({ fieldErrors: { occurredAt: { key: "errors.timestampInvalid" } } });
    }
    throw error;
  }

  try {
    await transactionRepository.update(transactionId, {
      amountMinor,
      description,
      category: category as TransactionCategory,
      occurredAt
    });
  } catch (error) {
    if (error instanceof TransactionNotEditableError || error instanceof TransactionNotFoundError) {
      return fail({ formError: domainErrorText(error) });
    }
    throw error;
  }

  const returnTo = resolveReturnTo(String(formData.get("returnTo") ?? ""), `/accounts/${accountId}`);
  (deps.redirectTo ?? redirect)(withSystemMessage(returnTo, "transaction_updated"));
  return {};
}
