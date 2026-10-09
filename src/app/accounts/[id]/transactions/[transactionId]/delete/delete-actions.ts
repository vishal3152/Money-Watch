"use server";

import { redirect } from "next/navigation";

import { resolveReturnTo } from "@/app/return-to";
import { withSystemMessage } from "@/app/components/system-message";
import { TransactionNotEditableError } from "@/db/errors";
import { getTransactionRepository, type RepositoryFactoryDeps } from "@/db/repository-factory";
import type { DeleteFormState } from "@/app/components/delete-confirm-form";
import { domainErrorText } from "@/app/domain-error-text";

export type DeleteTransactionDeps = RepositoryFactoryDeps & {
  redirectTo?: (path: string) => void;
};

export async function deleteTransaction(
  _prevState: DeleteFormState,
  formData: FormData,
  deps: DeleteTransactionDeps = {}
): Promise<DeleteFormState> {
  const transactionId = String(formData.get("transactionId") ?? "");
  const accountId = String(formData.get("accountId") ?? "");

  try {
    await (await getTransactionRepository(deps)).delete(transactionId);
  } catch (error) {
    if (error instanceof TransactionNotEditableError) {
      return { formError: domainErrorText(error) };
    }
    throw error;
  }

  const returnTo = resolveReturnTo(String(formData.get("returnTo") ?? ""), `/accounts/${accountId}`);
  (deps.redirectTo ?? redirect)(withSystemMessage(returnTo, "transaction_deleted"));
  return {};
}
