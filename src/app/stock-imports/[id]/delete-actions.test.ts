import { describe, expect, it, vi } from "vitest";

import type { DeleteFormState } from "@/app/components/delete-confirm-form";
import { deleteStockImportBatch } from "@/app/stock-imports/[id]/delete-actions";
import { InstitutionRepository } from "@/db/repositories/institution-repository";
import { ShareTradingAccountRepository } from "@/db/repositories/share-trading-account-repository";
import { StockImportBatchRepository } from "@/db/repositories/stock-import-batch-repository";
import { StockTransactionRepository } from "@/db/repositories/stock-transaction-repository";
import { createTestDb } from "@/db/repositories/test-db";

async function seedBatch(testDb: ReturnType<typeof createTestDb>) {
  await new InstitutionRepository(testDb.db).create({ id: "inst-1", name: "Broker One" });
  await new ShareTradingAccountRepository(testDb.db).create({
    id: "sta-1",
    institutionId: "inst-1",
    name: "US Equities",
    accountNumber: null,
    currencyCode: "USD"
  });
  const repository = new StockImportBatchRepository(testDb.db);
  await repository.create(
    {
      id: "batch-1",
      shareTradingAccountId: "sta-1",
      source: "broker-confirmation.pdf",
      createdAt: "2026-02-01T00:00:00.000Z"
    },
    [
      {
        id: "sxn-1",
        scripCode: "AAPL",
        type: "Buy",
        quantity: "10",
        price: "150.00",
        occurredAt: "2026-01-15",
        description: "Buy AAPL"
      }
    ]
  );
  return repository;
}

function formDataWithBatchId(batchId: string): FormData {
  const formData = new FormData();
  formData.set("batchId", batchId);
  return formData;
}

describe("deleteStockImportBatch", () => {
  it("deletes an unconfirmed batch and its StockTransactions, then redirects to the stock imports list", async () => {
    const testDb = createTestDb();
    const repository = await seedBatch(testDb);
    const redirectTo = vi.fn();

    const result = await deleteStockImportBatch({} as DeleteFormState, formDataWithBatchId("batch-1"), {
      db: testDb.db,
      redirectTo
    });

    expect(result).toEqual({});
    expect(await repository.getById("batch-1")).toBeNull();
    expect(await new StockTransactionRepository(testDb.db).listByShareTradingAccountId("sta-1")).toEqual([]);
    expect(redirectTo).toHaveBeenCalledWith("/stock-imports");
  });

  it("returns a form error and does not delete an already-confirmed batch", async () => {
    const testDb = createTestDb();
    const repository = await seedBatch(testDb);
    await repository.confirmAll("batch-1");
    const redirectTo = vi.fn();

    const result = await deleteStockImportBatch({} as DeleteFormState, formDataWithBatchId("batch-1"), {
      db: testDb.db,
      redirectTo
    });

    expect(result.formError).toBeDefined();
    expect(await repository.getById("batch-1")).not.toBeNull();
    expect(redirectTo).not.toHaveBeenCalled();
  });
});
