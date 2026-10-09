"use server";

import { redirect } from "next/navigation";

import { AccountHardDeleteBlockedError, EntityHasDependentsError } from "@/db/errors";
import { getAccountRepository, type RepositoryFactoryDeps } from "@/db/repository-factory";
import type { DeleteFormState } from "@/app/components/delete-confirm-form";
import { domainErrorText } from "@/app/domain-error-text";

export type DeleteAccountDeps = RepositoryFactoryDeps & {
  redirectTo?: (path: string) => void;
};

export async function deleteAccount(
  _prevState: DeleteFormState,
  formData: FormData,
  deps: DeleteAccountDeps = {}
): Promise<DeleteFormState> {
  const accountId = String(formData.get("accountId") ?? "");
  const institutionId = String(formData.get("institutionId") ?? "");
  const accounts = await getAccountRepository(deps);

  try {
    await accounts.delete(accountId);
  } catch (error) {
    if (error instanceof EntityHasDependentsError) {
      return { formError: domainErrorText(error) };
    }
    throw error;
  }

  (deps.redirectTo ?? redirect)(`/institutions/${institutionId}?message=bank_account_deleted`);
  return {};
}

export async function hardDeleteAccount(
  _prevState: DeleteFormState,
  formData: FormData,
  deps: DeleteAccountDeps = {}
): Promise<DeleteFormState> {
  const accountId = String(formData.get("accountId") ?? "");
  const institutionId = String(formData.get("institutionId") ?? "");
  const accounts = await getAccountRepository(deps);

  try {
    await accounts.hardDelete(accountId);
  } catch (error) {
    if (error instanceof EntityHasDependentsError || error instanceof AccountHardDeleteBlockedError) {
      return { formError: domainErrorText(error) };
    }
    throw error;
  }

  (deps.redirectTo ?? redirect)(`/institutions/${institutionId}?message=bank_account_hard_deleted`);
  return {};
}
