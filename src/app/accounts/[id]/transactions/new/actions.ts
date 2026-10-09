"use server";

import { redirect } from "next/navigation";

import { claimIdempotencyKey } from "@/app/duplicate-submission-guard";
import { withPersistedFormState } from "@/app/form-persistence";
import { textFieldLengthError } from "@/app/form-limits";
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
import type { LocalizedText } from "@/i18n/translator";

export type TransactionFormState = {
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

function isTransactionKind(value: string): value is TransactionKind {
  return value === "Income" || value === "Expense";
}

export type CreateTransactionDeps = RepositoryFactoryDeps & {
  redirectTo?: (path: string) => void;
  newId?: () => string;
};

export async function createTransaction(
  _prevState: TransactionFormState,
  formData: FormData,
  deps: CreateTransactionDeps = {}
): Promise<TransactionFormState> {
  const fail = (state: Omit<TransactionFormState, "values" | "formKey">) =>
    withPersistedFormState(formData, state);

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

  const idempotencyKey = String(formData.get("idempotencyKey") ?? "");
  if (!claimIdempotencyKey(idempotencyKey)) {
    return fail({ formError: { key: "errors.duplicateSubmission" } });
  }

  const id = (deps.newId ?? (() => crypto.randomUUID()))();
  await (await getTransactionRepository(deps)).create({
    id,
    accountId,
    amountMinor,
    occurredAt,
    description,
    trustStatus: "Confirmed",
    transferId: null,
    category: category as TransactionCategory,
    importBatchId: null
  });

  (deps.redirectTo ?? redirect)(`/accounts/${accountId}?message=transaction_created`);
  return {};
}
