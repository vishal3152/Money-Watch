"use server";

import { redirect } from "next/navigation";

import { withPersistedFormState } from "@/app/form-persistence";
import { textFieldLengthError } from "@/app/form-limits";
import { DatabaseConstraintError } from "@/db/errors";
import { getAccountRepository, type RepositoryFactoryDeps } from "@/db/repository-factory";
import type { LocalizedText } from "@/i18n/translator";

export type AccountFormState = {
  fieldErrors?: {
    name?: LocalizedText;
    accountNumber?: LocalizedText;
    currencyCode?: LocalizedText;
  };
  formError?: LocalizedText;
  values?: Record<string, string>;
  formKey?: string;
};

export type CreateAccountDeps = RepositoryFactoryDeps & {
  redirectTo?: (path: string) => void;
  newId?: () => string;
};

function optionalAccountNumber(value: FormDataEntryValue | null): string | null {
  const trimmed = String(value ?? "").trim();
  return trimmed.length === 0 ? null : trimmed;
}

export async function createAccount(
  _prevState: AccountFormState,
  formData: FormData,
  deps: CreateAccountDeps = {}
): Promise<AccountFormState> {
  const institutionId = String(formData.get("institutionId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const accountNumber = optionalAccountNumber(formData.get("accountNumber"));
  const currencyCode = String(formData.get("currencyCode") ?? "");
  const fieldErrors: NonNullable<AccountFormState["fieldErrors"]> = {};

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

  const accounts = await getAccountRepository(deps);
  const id = (deps.newId ?? (() => crypto.randomUUID()))();

  try {
    await accounts.create({
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

  (deps.redirectTo ?? redirect)(`/accounts/${id}?message=bank_account_created`);
  return {};
}
