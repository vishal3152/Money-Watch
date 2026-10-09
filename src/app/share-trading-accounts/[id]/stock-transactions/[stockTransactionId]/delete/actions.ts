"use server";

import { redirect } from "next/navigation";

import type { DeleteFormState } from "@/app/components/delete-confirm-form";
import { getStockTransactionRepository, type RepositoryFactoryDeps } from "@/db/repository-factory";

export type DeleteStockTransactionDeps = RepositoryFactoryDeps & {
  redirectTo?: (path: string) => void;
};

export async function deleteStockTransaction(
  _prevState: DeleteFormState,
  formData: FormData,
  deps: DeleteStockTransactionDeps = {}
): Promise<DeleteFormState> {
  const stockTransactionId = String(formData.get("stockTransactionId") ?? "");
  const shareTradingAccountId = String(formData.get("shareTradingAccountId") ?? "");

  const stockTransactionRepository = await getStockTransactionRepository(deps);
  const existing = await stockTransactionRepository.getById(stockTransactionId);

  if (!existing || existing.shareTradingAccountId !== shareTradingAccountId) {
    return { formError: { key: "errors.stockTransactionAccountMismatch" } };
  }

  await stockTransactionRepository.delete(stockTransactionId);

  (deps.redirectTo ?? redirect)(`/share-trading-accounts/${shareTradingAccountId}?message=stock_transaction_deleted`);
  return {};
}
