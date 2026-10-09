"use server";

import { redirect } from "next/navigation";

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

export type StockTransactionEditFormState = {
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

export type UpdateStockTransactionDeps = RepositoryFactoryDeps & {
  redirectTo?: (path: string) => void;
};

function isStockTransactionType(value: string): value is StockTransactionType {
  return value === "Buy" || value === "Sell";
}

export async function updateStockTransaction(
  _prevState: StockTransactionEditFormState,
  formData: FormData,
  deps: UpdateStockTransactionDeps = {}
): Promise<StockTransactionEditFormState> {
  const fail = (state: Omit<StockTransactionEditFormState, "values" | "formKey">) =>
    withPersistedFormState(formData, state);

  const stockTransactionId = String(formData.get("stockTransactionId") ?? "");
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

  const stockTransactionRepository = await getStockTransactionRepository(deps);
  const existing = await stockTransactionRepository.getById(stockTransactionId);

  if (!existing || existing.shareTradingAccountId !== shareTradingAccountId) {
    return fail({ formError: { key: "errors.stockTransactionAccountMismatch" } });
  }

  if (typeInput === "Sell") {
    const currentQuantity = await stockTransactionRepository.sumQuantityByScripCode(
      shareTradingAccountId,
      scripCode,
      { excludeId: stockTransactionId }
    );
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

  await stockTransactionRepository.update(stockTransactionId, {
    scripCode,
    type: typeInput,
    quantity,
    pricePerUnitMinor,
    occurredAt,
    description
  });

  (deps.redirectTo ?? redirect)(`/share-trading-accounts/${shareTradingAccountId}?message=stock_transaction_updated`);
  return {};
}
