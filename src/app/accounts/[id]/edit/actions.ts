"use server";

import { redirect } from "next/navigation";

import { withPersistedFormState } from "@/app/form-persistence";
import { textFieldLengthError } from "@/app/form-limits";
import { getAccountRepository, type RepositoryFactoryDeps } from "@/db/repository-factory";
import type { LocalizedText } from "@/i18n/translator";

export type EditAccountFormState = {
  fieldErrors?: {
    name?: LocalizedText;
    accountNumber?: LocalizedText;
  };
  values?: Record<string, string>;
  formKey?: string;
};

export type UpdateAccountDeps = RepositoryFactoryDeps & {
  redirectTo?: (path: string) => void;
};

function optionalAccountNumber(value: FormDataEntryValue | null): string | null {
  const trimmed = String(value ?? "").trim();
  return trimmed.length === 0 ? null : trimmed;
}

export async function updateAccount(
  _prevState: EditAccountFormState,
  formData: FormData,
  deps: UpdateAccountDeps = {}
): Promise<EditAccountFormState> {
  const accountId = String(formData.get("accountId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const accountNumber = optionalAccountNumber(formData.get("accountNumber"));
  const fieldErrors: NonNullable<EditAccountFormState["fieldErrors"]> = {};

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

  const accounts = await getAccountRepository(deps);
  await accounts.update(accountId, { name, accountNumber });

  const redirectTo = deps.redirectTo ?? redirect;
  redirectTo(`/accounts/${accountId}?message=bank_account_updated`);

  return {};
}
