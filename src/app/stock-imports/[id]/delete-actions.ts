"use server";

import { redirect } from "next/navigation";

import type { DeleteFormState } from "@/app/components/delete-confirm-form";
import { StockImportBatchAlreadyConfirmedError } from "@/db/errors";
import { getStockImportBatchRepository, type RepositoryFactoryDeps } from "@/db/repository-factory";
import { domainErrorText } from "@/app/domain-error-text";

export type DeleteStockImportBatchDeps = RepositoryFactoryDeps & {
  redirectTo?: (path: string) => void;
};

export async function deleteStockImportBatch(
  _prevState: DeleteFormState,
  formData: FormData,
  deps: DeleteStockImportBatchDeps = {}
): Promise<DeleteFormState> {
  const batchId = String(formData.get("batchId") ?? "");

  try {
    await (await getStockImportBatchRepository(deps)).delete(batchId);
  } catch (error) {
    if (error instanceof StockImportBatchAlreadyConfirmedError) {
      return { formError: domainErrorText(error) };
    }
    throw error;
  }

  (deps.redirectTo ?? redirect)("/stock-imports");
  return {};
}
