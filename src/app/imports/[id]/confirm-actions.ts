"use server";

import { redirect } from "next/navigation";

import {
  ImportBatchAlreadyConfirmedError,
  ImportBatchHasUnresolvedDuplicatesError,
  ImportBatchNotFoundError
} from "@/db/errors";
import { getImportBatchRepository, type RepositoryFactoryDeps } from "@/db/repository-factory";
import { domainErrorText } from "@/app/domain-error-text";
import type { LocalizedText } from "@/i18n/translator";

export type ConfirmImportBatchState = {
  formError?: LocalizedText;
};

export type ConfirmImportBatchDeps = RepositoryFactoryDeps & {
  redirectTo?: (path: string) => void;
};

export async function confirmImportBatch(
  _prevState: ConfirmImportBatchState,
  formData: FormData,
  deps: ConfirmImportBatchDeps = {}
): Promise<ConfirmImportBatchState> {
  const batchId = String(formData.get("batchId") ?? "");

  try {
    await (await getImportBatchRepository(deps)).confirmAll(batchId);
  } catch (error) {
    if (
      error instanceof ImportBatchAlreadyConfirmedError ||
      error instanceof ImportBatchNotFoundError ||
      error instanceof ImportBatchHasUnresolvedDuplicatesError
    ) {
      return { formError: domainErrorText(error) };
    }
    throw error;
  }

  (deps.redirectTo ?? redirect)(`/imports/${batchId}`);
  return {};
}
