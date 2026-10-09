"use server";

import { redirect } from "next/navigation";

import { claimIdempotencyKey } from "@/app/duplicate-submission-guard";
import { domainErrorText } from "@/app/domain-error-text";
import { withPersistedFormState } from "@/app/form-persistence";
import { textFieldLengthError } from "@/app/form-limits";
import {
  getShareTradingAccountRepository,
  getStockTransactionRepository,
  type RepositoryFactoryDeps
} from "@/db/repository-factory";
import { parseDecimalToMinorUnits } from "@/domain/decimal-input";
import { InvalidMinorUnitsError } from "@/domain/money";
import {
  assertSufficientHoldingsForSale,
  InsufficientHoldingsError,
  InvalidStockQuantityError,
  parseWholeShareQuantity,
  type StockTransactionType
} from "@/domain/stock-transaction";
import type { LocalizedText } from "@/i18n/translator";
import {
  InvalidTransactionTimestampError,
  normalizeTransactionTimestamp
} from "@/domain/transaction";

export type StockTransactionFormState = {
  fieldErrors?: {
    scripCode?: LocalizedText;
    type?: LocalizedText;
    quantity?: LocalizedText;
    price?: LocalizedText;
    occurredAt?: LocalizedText;
    description?: LocalizedText;
  };
  formError?: LocalizedText;
  values?: Record<string, string>;
  formKey?: string;
};

function isStockTransactionType(value: string): value is StockTransactionType {
  return value === "Buy" || value === "Sell";
}

export type CreateStockTransactionDeps = RepositoryFactoryDeps & {
  redirectTo?: (path: string) => void;
  newId?: () => string;
};

export async function createStockTransaction(
  _prevState: StockTransactionFormState,
  formData: FormData,
  deps: CreateStockTransactionDeps = {}
): Promise<StockTransactionFormState> {
  const fail = (state: Omit<StockTransactionFormState, "values" | "formKey">) =>
    withPersistedFormState(formData, state);

  const shareTradingAccountId = String(formData.get("shareTradingAccountId") ?? "");
  const scripCodeInput = String(formData.get("scripCode") ?? "").trim();
  const typeInput = String(formData.get("type") ?? "");
  const quantityInput = String(formData.get("quantity") ?? "").trim();
  const priceInput = String(formData.get("price") ?? "");
  const occurredAtInput = String(formData.get("occurredAt") ?? "");
  const description = String(formData.get("description") ?? "").trim();

  if (scripCodeInput.length === 0) {
    return fail({ fieldErrors: { scripCode: { key: "errors.scripCodeRequired" } } });
  }
  const scripCodeLengthError = textFieldLengthError(scripCodeInput);
  if (scripCodeLengthError) {
    return fail({ fieldErrors: { scripCode: scripCodeLengthError } });
  }
  const scripCode = scripCodeInput.toUpperCase();

  if (!isStockTransactionType(typeInput)) {
    return fail({ fieldErrors: { type: { key: "errors.stockTypeRequired" } } });
  }

  if (description.length === 0) {
    return fail({ fieldErrors: { description: { key: "errors.descriptionRequired" } } });
  }
  const descriptionLengthError = textFieldLengthError(description);
  if (descriptionLengthError) {
    return fail({ fieldErrors: { description: descriptionLengthError } });
  }

  let quantity: number;
  try {
    quantity = parseWholeShareQuantity(quantityInput);
  } catch (error) {
    if (error instanceof InvalidStockQuantityError) {
      return fail({ fieldErrors: { quantity: { key: "errors.quantityInvalid" } } });
    }
    throw error;
  }

  const shareTradingAccounts = await getShareTradingAccountRepository(deps);
  const shareTradingAccount = await shareTradingAccounts.getById(shareTradingAccountId);

  if (!shareTradingAccount) {
    return fail({ formError: { key: "errors.shareTradingAccountMissing" } });
  }

  const stockTransactions = await getStockTransactionRepository(deps);

  if (typeInput === "Sell") {
    const currentQuantity = await stockTransactions.sumQuantityByScripCode(shareTradingAccountId, scripCode);
    try {
      assertSufficientHoldingsForSale(scripCode, currentQuantity, quantity);
    } catch (error) {
      if (error instanceof InsufficientHoldingsError) {
        return fail({ fieldErrors: { quantity: domainErrorText(error) } });
      }
      throw error;
    }
  }

  let pricePerUnitMinor: number;
  try {
    pricePerUnitMinor = parseDecimalToMinorUnits(priceInput, shareTradingAccount.currencyCode);
  } catch (error) {
    if (error instanceof InvalidMinorUnitsError) {
      return fail({
        fieldErrors: { price: { key: "errors.priceInvalid" } }
      });
    }
    throw error;
  }
  if (pricePerUnitMinor < 0) {
    return fail({
      fieldErrors: { price: { key: "errors.priceInvalid" } }
    });
  }

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
    return fail({
      formError: { key: "errors.duplicateSubmission" }
    });
  }

  const id = (deps.newId ?? (() => crypto.randomUUID()))();
  await stockTransactions.create({
    id,
    shareTradingAccountId,
    scripCode,
    type: typeInput,
    quantity,
    pricePerUnitMinor,
    occurredAt,
    description,
    trustStatus: "Confirmed",
    importBatchId: null
  });

  (deps.redirectTo ?? redirect)(`/share-trading-accounts/${shareTradingAccountId}?message=stock_transaction_created`);
  return {};
}
