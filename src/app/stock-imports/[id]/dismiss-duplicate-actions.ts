"use server";

import { redirect } from "next/navigation";

import { StockTransactionNotFoundError } from "@/db/errors";
import { getStockTransactionRepository, type RepositoryFactoryDeps } from "@/db/repository-factory";
import { domainErrorText } from "@/app/domain-error-text";
import type { LocalizedText } from "@/i18n/translator";

export type DismissStockDuplicateState = {
  formError?: LocalizedText;
};

export type DismissStockDuplicateDeps = RepositoryFactoryDeps & {
  redirectTo?: (path: string) => void;
};

export async function dismissStockSuspectedDuplicate(
  _prevState: DismissStockDuplicateState,
  formData: FormData,
  deps: DismissStockDuplicateDeps = {}
): Promise<DismissStockDuplicateState> {
  const stockTransactionId = String(formData.get("stockTransactionId") ?? "");
  const batchId = String(formData.get("batchId") ?? "");

  try {
    await (await getStockTransactionRepository(deps)).dismissSuspectedDuplicate(stockTransactionId);
  } catch (error) {
    if (error instanceof StockTransactionNotFoundError) {
      return { formError: domainErrorText(error) };
    }
    throw error;
  }

  (deps.redirectTo ?? redirect)(`/stock-imports/${batchId}`);
  return {};
}
