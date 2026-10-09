"use server";

import { redirect } from "next/navigation";

import { TransactionNotFoundError } from "@/db/errors";
import { getTransactionRepository, type RepositoryFactoryDeps } from "@/db/repository-factory";
import { domainErrorText } from "@/app/domain-error-text";
import type { LocalizedText } from "@/i18n/translator";

export type DismissDuplicateState = {
  formError?: LocalizedText;
};

export type DismissDuplicateDeps = RepositoryFactoryDeps & {
  redirectTo?: (path: string) => void;
};

export async function dismissSuspectedDuplicate(
  _prevState: DismissDuplicateState,
  formData: FormData,
  deps: DismissDuplicateDeps = {}
): Promise<DismissDuplicateState> {
  const transactionId = String(formData.get("transactionId") ?? "");
  const batchId = String(formData.get("batchId") ?? "");

  try {
    await (await getTransactionRepository(deps)).dismissSuspectedDuplicate(transactionId);
  } catch (error) {
    if (error instanceof TransactionNotFoundError) {
      return { formError: domainErrorText(error) };
    }
    throw error;
  }

  (deps.redirectTo ?? redirect)(`/imports/${batchId}`);
  return {};
}
