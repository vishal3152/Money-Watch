"use server";

import { redirect } from "next/navigation";

import {
  StockImportBatchAlreadyConfirmedError,
  StockImportBatchHasUnresolvedDuplicatesError,
  StockImportBatchNotFoundError
} from "@/db/errors";
import { getStockImportBatchRepository, type RepositoryFactoryDeps } from "@/db/repository-factory";
import { domainErrorText } from "@/app/domain-error-text";
import type { LocalizedText } from "@/i18n/translator";

export type ConfirmStockImportBatchState = {
  formError?: LocalizedText;
};

export type ConfirmStockImportBatchDeps = RepositoryFactoryDeps & {
  redirectTo?: (path: string) => void;
};

export async function confirmStockImportBatch(
  _prevState: ConfirmStockImportBatchState,
  formData: FormData,
  deps: ConfirmStockImportBatchDeps = {}
): Promise<ConfirmStockImportBatchState> {
  const batchId = String(formData.get("batchId") ?? "");

  try {
    await (await getStockImportBatchRepository(deps)).confirmAll(batchId);
  } catch (error) {
    if (
      error instanceof StockImportBatchAlreadyConfirmedError ||
      error instanceof StockImportBatchNotFoundError ||
      error instanceof StockImportBatchHasUnresolvedDuplicatesError
    ) {
      return { formError: domainErrorText(error) };
    }
    throw error;
  }

  (deps.redirectTo ?? redirect)(`/stock-imports/${batchId}`);
  return {};
}
