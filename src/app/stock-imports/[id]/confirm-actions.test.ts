import { describe, expect, it, vi } from "vitest";

import { confirmStockImportBatch, type ConfirmStockImportBatchState } from "@/app/stock-imports/[id]/confirm-actions";
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

describe("confirmStockImportBatch", () => {
  it("confirms an unconfirmed batch and redirects to its review page", async () => {
    const testDb = createTestDb();
    const repository = await seedBatch(testDb);
    const redirectTo = vi.fn();

    const result = await confirmStockImportBatch(
      {} as ConfirmStockImportBatchState,
      formDataWithBatchId("batch-1"),
      { db: testDb.db, redirectTo }
    );

    expect(result).toEqual({});
    expect((await repository.getById("batch-1"))?.confirmedAt).not.toBeNull();
    const [stockTransaction] = await new StockTransactionRepository(testDb.db).listByShareTradingAccountId("sta-1");
    expect(stockTransaction?.trustStatus).toBe("Confirmed");
    expect(redirectTo).toHaveBeenCalledWith("/stock-imports/batch-1");
  });

  it("returns a form error and does not redirect for an unknown batch id", async () => {
    const testDb = createTestDb();
    const redirectTo = vi.fn();

    const result = await confirmStockImportBatch(
      {} as ConfirmStockImportBatchState,
      formDataWithBatchId("missing-batch"),
      { db: testDb.db, redirectTo }
    );

    expect(result.formError).toBeDefined();
    expect(redirectTo).not.toHaveBeenCalled();
  });

  it("returns a form error and does not redirect for an already-confirmed batch", async () => {
    const testDb = createTestDb();
    const repository = await seedBatch(testDb);
    await repository.confirmAll("batch-1");
    const redirectTo = vi.fn();

    const result = await confirmStockImportBatch(
      {} as ConfirmStockImportBatchState,
      formDataWithBatchId("batch-1"),
      { db: testDb.db, redirectTo }
    );

    expect(result.formError).toBeDefined();
    expect(redirectTo).not.toHaveBeenCalled();
  });

  it("returns a form error and does not redirect when a batch StockTransaction still carries a Suspected Duplicate flag", async () => {
    const testDb = createTestDb();
    await new InstitutionRepository(testDb.db).create({ id: "inst-1", name: "Broker One" });
    await new ShareTradingAccountRepository(testDb.db).create({
      id: "sta-1",
      institutionId: "inst-1",
      name: "US Equities",
      accountNumber: null,
      currencyCode: "USD"
    });
    await new StockTransactionRepository(testDb.db).create({
      id: "existing-stxn",
      shareTradingAccountId: "sta-1",
      scripCode: "AAPL",
      type: "Buy",
      quantity: 10,
      pricePerUnitMinor: 15_000,
      occurredAt: "2026-01-15T00:00:00.000Z",
      description: "Buy AAPL",
      trustStatus: "Confirmed",
      importBatchId: null
    });
    const repository = new StockImportBatchRepository(testDb.db);
    await repository.create(
      {
        id: "batch-1",
        shareTradingAccountId: "sta-1",
        source: "broker-confirmation.pdf",
        createdAt: "2026-02-01T00:00:00.000Z"
      },
      [{ id: "stxn-1", scripCode: "AAPL", type: "Buy", quantity: "10", price: "150.00", occurredAt: "2026-01-15", description: "Buy" }]
    );
    const redirectTo = vi.fn();

    const result = await confirmStockImportBatch(
      {} as ConfirmStockImportBatchState,
      formDataWithBatchId("batch-1"),
      { db: testDb.db, redirectTo }
    );

    expect(result.formError).toBeDefined();
    expect(redirectTo).not.toHaveBeenCalled();
    expect((await repository.getById("batch-1"))?.confirmedAt).toBeNull();
  });
});
