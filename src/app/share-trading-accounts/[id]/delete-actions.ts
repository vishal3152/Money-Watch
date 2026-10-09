"use server";

import { redirect } from "next/navigation";

import { EntityHasDependentsError } from "@/db/errors";
import { getShareTradingAccountRepository, type RepositoryFactoryDeps } from "@/db/repository-factory";
import type { DeleteFormState } from "@/app/components/delete-confirm-form";
import { domainErrorText } from "@/app/domain-error-text";

export type DeleteShareTradingAccountDeps = RepositoryFactoryDeps & {
  redirectTo?: (path: string) => void;
};

export async function deleteShareTradingAccount(
  _prevState: DeleteFormState,
  formData: FormData,
  deps: DeleteShareTradingAccountDeps = {}
): Promise<DeleteFormState> {
  const shareTradingAccountId = String(formData.get("shareTradingAccountId") ?? "");
  const institutionId = String(formData.get("institutionId") ?? "");
  const shareTradingAccounts = await getShareTradingAccountRepository(deps);

  try {
    await shareTradingAccounts.delete(shareTradingAccountId);
  } catch (error) {
    if (error instanceof EntityHasDependentsError) {
      return { formError: domainErrorText(error) };
    }
    throw error;
  }

  (deps.redirectTo ?? redirect)(`/institutions/${institutionId}?message=share_trading_account_deleted`);
  return {};
}
