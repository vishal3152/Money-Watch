import { describe, expect, it, vi } from "vitest";

import {
  dismissStockSuspectedDuplicate,
  type DismissStockDuplicateState
} from "@/app/stock-imports/[id]/dismiss-duplicate-actions";
import { InstitutionRepository } from "@/db/repositories/institution-repository";
import { ShareTradingAccountRepository } from "@/db/repositories/share-trading-account-repository";
import { StockTransactionRepository } from "@/db/repositories/stock-transaction-repository";
import { createTestDb } from "@/db/repositories/test-db";

async function seedFlaggedStockTransaction(testDb: ReturnType<typeof createTestDb>) {
  await new InstitutionRepository(testDb.db).create({ id: "inst-1", name: "Broker One" });
  await new ShareTradingAccountRepository(testDb.db).create({
    id: "sta-1",
    institutionId: "inst-1",
    name: "US Equities",
    accountNumber: null,
    currencyCode: "USD"
  });
  const stockTransactionRepository = new StockTransactionRepository(testDb.db);
  await stockTransactionRepository.create({
    id: "original-stxn",
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
  await stockTransactionRepository.create({
    id: "flagged-stxn",
    shareTradingAccountId: "sta-1",
    scripCode: "AAPL",
    type: "Buy",
    quantity: 10,
    pricePerUnitMinor: 15_000,
    occurredAt: "2026-01-15T00:00:00.000Z",
    description: "Buy AAPL [REF]",
    trustStatus: "Imported",
    importBatchId: null,
    possibleDuplicateOfTransactionId: "original-stxn"
  });
  return stockTransactionRepository;
}

function formData(stockTransactionId: string, batchId: string): FormData {
  const data = new FormData();
  data.set("stockTransactionId", stockTransactionId);
  data.set("batchId", batchId);
  return data;
}

describe("dismissStockSuspectedDuplicate", () => {
  it("clears the flag and redirects back to the stock import batch review page", async () => {
    const testDb = createTestDb();
    const stockTransactionRepository = await seedFlaggedStockTransaction(testDb);
    const redirectTo = vi.fn();

    const result = await dismissStockSuspectedDuplicate(
      {} as DismissStockDuplicateState,
      formData("flagged-stxn", "batch-1"),
      { db: testDb.db, redirectTo }
    );

    expect(result).toEqual({});
    expect((await stockTransactionRepository.getById("flagged-stxn"))?.possibleDuplicateOfTransactionId).toBeNull();
    expect(redirectTo).toHaveBeenCalledWith("/stock-imports/batch-1");
  });

  it("returns a form error and does not redirect for an unknown stock transaction id", async () => {
    const testDb = createTestDb();
    const redirectTo = vi.fn();

    const result = await dismissStockSuspectedDuplicate(
      {} as DismissStockDuplicateState,
      formData("missing-stxn", "batch-1"),
      { db: testDb.db, redirectTo }
    );

    expect(result.formError).toBeDefined();
    expect(redirectTo).not.toHaveBeenCalled();
  });
});
