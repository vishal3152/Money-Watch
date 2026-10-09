"use server";

import { redirect } from "next/navigation";

import { withPersistedFormState } from "@/app/form-persistence";
import { textFieldLengthError } from "@/app/form-limits";
import { getShareTradingAccountRepository, type RepositoryFactoryDeps } from "@/db/repository-factory";
import type { LocalizedText } from "@/i18n/translator";

export type EditShareTradingAccountFormState = {
  fieldErrors?: {
    name?: LocalizedText;
    accountNumber?: LocalizedText;
  };
  values?: Record<string, string>;
  formKey?: string;
};

export type UpdateShareTradingAccountDeps = RepositoryFactoryDeps & {
  redirectTo?: (path: string) => void;
};

function optionalAccountNumber(value: FormDataEntryValue | null): string | null {
  const trimmed = String(value ?? "").trim();
  return trimmed.length === 0 ? null : trimmed;
}

export async function updateShareTradingAccount(
  _prevState: EditShareTradingAccountFormState,
  formData: FormData,
  deps: UpdateShareTradingAccountDeps = {}
): Promise<EditShareTradingAccountFormState> {
  const shareTradingAccountId = String(formData.get("shareTradingAccountId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const accountNumber = optionalAccountNumber(formData.get("accountNumber"));
  const fieldErrors: NonNullable<EditShareTradingAccountFormState["fieldErrors"]> = {};

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

  if (Object.keys(fieldErrors).length > 0) {
    return withPersistedFormState(formData, { fieldErrors });
  }

  const shareTradingAccounts = await getShareTradingAccountRepository(deps);
  await shareTradingAccounts.update(shareTradingAccountId, { name, accountNumber });

  const redirectTo = deps.redirectTo ?? redirect;
  redirectTo(`/share-trading-accounts/${shareTradingAccountId}?message=share_trading_account_updated`);

  return {};
}
