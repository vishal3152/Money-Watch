"use server";

import { redirect } from "next/navigation";

import {
  ImportBatchAlreadyConfirmedError,
  ImportBatchNotConfirmedError,
  ImportBatchUndoBlockedError
} from "@/db/errors";
import { getImportBatchRepository, type RepositoryFactoryDeps } from "@/db/repository-factory";
import type { DeleteFormState } from "@/app/components/delete-confirm-form";
import { domainErrorText } from "@/app/domain-error-text";

export type DeleteImportBatchDeps = RepositoryFactoryDeps & {
  redirectTo?: (path: string) => void;
};

export async function deleteImportBatch(
  _prevState: DeleteFormState,
  formData: FormData,
  deps: DeleteImportBatchDeps = {}
): Promise<DeleteFormState> {
  const batchId = String(formData.get("batchId") ?? "");

  try {
    await (await getImportBatchRepository(deps)).delete(batchId);
  } catch (error) {
    if (error instanceof ImportBatchAlreadyConfirmedError) {
      return { formError: domainErrorText(error) };
    }
    throw error;
  }

  (deps.redirectTo ?? redirect)("/imports");
  return {};
}

export async function undoConfirmedImportBatch(
  _prevState: DeleteFormState,
  formData: FormData,
  deps: DeleteImportBatchDeps = {}
): Promise<DeleteFormState> {
  const batchId = String(formData.get("batchId") ?? "");

  try {
    await (await getImportBatchRepository(deps)).undoConfirmed(batchId);
  } catch (error) {
    if (error instanceof ImportBatchNotConfirmedError || error instanceof ImportBatchUndoBlockedError) {
      return { formError: domainErrorText(error) };
    }
    throw error;
  }

  (deps.redirectTo ?? redirect)("/imports");
  return {};
}
