"use server";

import { redirect } from "next/navigation";

import { withPersistedFormState } from "@/app/form-persistence";
import { textFieldLengthError } from "@/app/form-limits";
import { DatabaseConstraintError } from "@/db/errors";
import { getShareTradingAccountRepository, type RepositoryFactoryDeps } from "@/db/repository-factory";
import type { LocalizedText } from "@/i18n/translator";

export type ShareTradingAccountFormState = {
  fieldErrors?: {
    name?: LocalizedText;
    accountNumber?: LocalizedText;
    currencyCode?: LocalizedText;
  };
  formError?: LocalizedText;
  values?: Record<string, string>;
  formKey?: string;
};

export type CreateShareTradingAccountDeps = RepositoryFactoryDeps & {
  redirectTo?: (path: string) => void;
  newId?: () => string;
};

function optionalAccountNumber(value: FormDataEntryValue | null): string | null {
  const trimmed = String(value ?? "").trim();
  return trimmed.length === 0 ? null : trimmed;
}

export async function createShareTradingAccount(
  _prevState: ShareTradingAccountFormState,
  formData: FormData,
  deps: CreateShareTradingAccountDeps = {}
): Promise<ShareTradingAccountFormState> {
  const institutionId = String(formData.get("institutionId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const accountNumber = optionalAccountNumber(formData.get("accountNumber"));
  const currencyCode = String(formData.get("currencyCode") ?? "");
  const fieldErrors: NonNullable<ShareTradingAccountFormState["fieldErrors"]> = {};

  if (name.length === 0) {
    fieldErrors.name = { key: "errors.accountNameRequired" };
  } else {
    const nameLengthError = textFieldLengthError(name);
    if (nameLengthError) {
      fieldErrors.name = nameLengthError;
    }
  }

  if (accountNumber !== null) {
    const accountNumberLengthError = textFieldLengthError(accountNumber);
    if (accountNumberLengthError) {
      fieldErrors.accountNumber = accountNumberLengthError;
    }
  }

  if (!/^[A-Z]{3}$/.test(currencyCode)) {
    fieldErrors.currencyCode = { key: "errors.currencyCodeInvalid" };
  }

  if (Object.keys(fieldErrors).length > 0) {
    return withPersistedFormState(formData, { fieldErrors });
  }

  const shareTradingAccounts = await getShareTradingAccountRepository(deps);
  const id = (deps.newId ?? (() => crypto.randomUUID()))();

  try {
    await shareTradingAccounts.create({
      id,
      institutionId,
      name,
      accountNumber,
      currencyCode
    });
  } catch (error) {
    if (error instanceof DatabaseConstraintError) {
      return withPersistedFormState(formData, {
        formError: { key: "errors.institutionMissing" }
      });
    }
    throw error;
  }

  (deps.redirectTo ?? redirect)(`/share-trading-accounts/${id}?message=share_trading_account_created`);
  return {};
}
