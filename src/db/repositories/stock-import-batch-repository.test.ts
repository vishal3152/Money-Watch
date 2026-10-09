import { describe, expect, it } from "vitest";

import {
  DatabaseConstraintError,
  StockImportBatchAlreadyConfirmedError,
  StockImportBatchHasUnresolvedDuplicatesError
} from "@/db/errors";
import { InstitutionRepository } from "@/db/repositories/institution-repository";
import { ShareTradingAccountRepository } from "@/db/repositories/share-trading-account-repository";
import { StockImportBatchRepository } from "@/db/repositories/stock-import-batch-repository";
import { StockTransactionRepository } from "@/db/repositories/stock-transaction-repository";
import { createTestDb } from "@/db/repositories/test-db";
import { EmptyStockImportBatchError } from "@/domain/stock-import-batch";

async function seedShareTradingAccount(db: ReturnType<typeof createTestDb>["db"]) {
  await new InstitutionRepository(db).create({ id: "inst-1", name: "Broker One" });
  await new ShareTradingAccountRepository(db).create({
    id: "sta-1",
    institutionId: "inst-1",
    name: "US Equities",
    accountNumber: null,
    currencyCode: "USD"
  });
}

describe("StockImportBatchRepository", () => {
  it("creates a batch and its Imported StockTransactions, normalizing scripCode to uppercase", async () => {
    const testDb = createTestDb();
    await seedShareTradingAccount(testDb.db);
    const repository = new StockImportBatchRepository(testDb.db);

    const batch = await repository.create(
      { id: "batch-1", shareTradingAccountId: "sta-1", source: "broker-confirmation.pdf", createdAt: "2026-02-01T00:00:00.000Z" },
      [
        {
          id: "stxn-1",
          scripCode: "aapl",
          type: "Buy",
          quantity: "10",
          price: "150.00",
          occurredAt: "2026-01-15",
          description: "Buy AAPL"
        }
      ]
    );

    expect(batch).toEqual({
      id: "batch-1",
      shareTradingAccountId: "sta-1",
      source: "broker-confirmation.pdf",
      createdAt: "2026-02-01T00:00:00.000Z",
      confirmedAt: null
    });
    expect(await new StockTransactionRepository(testDb.db).getById("stxn-1")).toEqual({
      id: "stxn-1",
      shareTradingAccountId: "sta-1",
      scripCode: "AAPL",
      type: "Buy",
      quantity: 10,
      pricePerUnitMinor: 15_000,
      occurredAt: "2026-01-15T00:00:00.000Z",
      description: "Buy AAPL",
      trustStatus: "Imported",
      importBatchId: "batch-1",
      externalRef: null,
      possibleDuplicateOfTransactionId: null
    });
  });

  it("rejects an empty line-item list before any write", async () => {
    const testDb = createTestDb();
    await seedShareTradingAccount(testDb.db);
    const repository = new StockImportBatchRepository(testDb.db);

    await expect(
      repository.create(
        { id: "batch-1", shareTradingAccountId: "sta-1", source: "x", createdAt: "2026-02-01T00:00:00.000Z" },
        []
      )
    ).rejects.toBeInstanceOf(EmptyStockImportBatchError);
    expect(await repository.listAll()).toEqual([]);
  });

  it("rejects an unknown shareTradingAccountId before any write", async () => {
    const testDb = createTestDb();
    const repository = new StockImportBatchRepository(testDb.db);

    await expect(
      repository.create(
        { id: "batch-1", shareTradingAccountId: "missing", source: "x", createdAt: "2026-02-01T00:00:00.000Z" },
        [{ id: "stxn-1", scripCode: "AAPL", type: "Buy", quantity: "10", price: "150.00", occurredAt: "2026-01-15", description: "Buy" }]
      )
    ).rejects.toBeInstanceOf(DatabaseConstraintError);
  });

  it("sets possibleDuplicateOfTransactionId on a line item matching an existing StockTransaction's natural key", async () => {
    const testDb = createTestDb();
    await seedShareTradingAccount(testDb.db);
    const stockTransactionRepository = new StockTransactionRepository(testDb.db);
    await stockTransactionRepository.create({
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
      { id: "batch-1", shareTradingAccountId: "sta-1", source: "x", createdAt: "2026-02-01T00:00:00.000Z" },
      [
        {
          id: "stxn-1",
          scripCode: "aapl",
          type: "Buy",
          quantity: "10",
          price: "150.00",
          occurredAt: "2026-01-15",
          description: "Buy AAPL [REF]"
        }
      ]
    );

    const created = await stockTransactionRepository.getById("stxn-1");
    expect(created?.possibleDuplicateOfTransactionId).toBe("existing-stxn");
  });

  it("leaves possibleDuplicateOfTransactionId null when no existing StockTransaction matches", async () => {
    const testDb = createTestDb();
    await seedShareTradingAccount(testDb.db);
    const repository = new StockImportBatchRepository(testDb.db);

    await repository.create(
      { id: "batch-1", shareTradingAccountId: "sta-1", source: "x", createdAt: "2026-02-01T00:00:00.000Z" },
      [{ id: "stxn-1", scripCode: "AAPL", type: "Buy", quantity: "10", price: "150.00", occurredAt: "2026-01-15", description: "Buy" }]
    );

    const created = await new StockTransactionRepository(testDb.db).getById("stxn-1");
    expect(created?.possibleDuplicateOfTransactionId).toBeNull();
  });

  it("flags a line item repeating an earlier line item in the same batch, leaving the first occurrence unflagged", async () => {
    const testDb = createTestDb();
    await seedShareTradingAccount(testDb.db);
    const repository = new StockImportBatchRepository(testDb.db);

    await repository.create(
      { id: "batch-1", shareTradingAccountId: "sta-1", source: "x", createdAt: "2026-02-01T00:00:00.000Z" },
      [
        { id: "stxn-1", scripCode: "AAPL", type: "Buy", quantity: "10", price: "150.00", occurredAt: "2026-01-15", description: "Buy" },
        { id: "stxn-2", scripCode: "AAPL", type: "Buy", quantity: "10", price: "150.00", occurredAt: "2026-01-15", description: "Buy" }
      ]
    );

    const stockTransactionRepository = new StockTransactionRepository(testDb.db);
    expect((await stockTransactionRepository.getById("stxn-1"))?.possibleDuplicateOfTransactionId).toBeNull();
    expect((await stockTransactionRepository.getById("stxn-2"))?.possibleDuplicateOfTransactionId).toBe("stxn-1");
  });

  it("prefers a match by externalRef over the natural key, matching even when the date differs", async () => {
    const testDb = createTestDb();
    await seedShareTradingAccount(testDb.db);
    const stockTransactionRepository = new StockTransactionRepository(testDb.db);
    await stockTransactionRepository.create({
      id: "existing-stxn",
      shareTradingAccountId: "sta-1",
      scripCode: "AAPL",
      type: "Buy",
      quantity: 10,
      pricePerUnitMinor: 15_000,
      occurredAt: "2026-01-15T00:00:00.000Z",
      description: "Buy AAPL",
      trustStatus: "Confirmed",
      importBatchId: null,
      externalRef: "ORD123"
    });

    const repository = new StockImportBatchRepository(testDb.db);
    await repository.create(
      { id: "batch-1", shareTradingAccountId: "sta-1", source: "x", createdAt: "2026-02-01T00:00:00.000Z" },
      [
        {
          id: "stxn-1",
          scripCode: "AAPL",
          type: "Buy",
          quantity: "10",
          price: "150.00",
          occurredAt: "2026-01-20",
          description: "Buy AAPL (restated)",
          externalRef: "ORD123"
        }
      ]
    );

    const created = await stockTransactionRepository.getById("stxn-1");
    expect(created?.possibleDuplicateOfTransactionId).toBe("existing-stxn");
  });

  it("confirmAll throws StockImportBatchHasUnresolvedDuplicatesError when a batch StockTransaction still carries a Suspected Duplicate flag", async () => {
    const testDb = createTestDb();
    await seedShareTradingAccount(testDb.db);
    const stockTransactionRepository = new StockTransactionRepository(testDb.db);
    await stockTransactionRepository.create({
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
      { id: "batch-1", shareTradingAccountId: "sta-1", source: "x", createdAt: "2026-02-01T00:00:00.000Z" },
      [{ id: "stxn-1", scripCode: "AAPL", type: "Buy", quantity: "10", price: "150.00", occurredAt: "2026-01-15", description: "Buy" }]
    );

    await expect(repository.confirmAll("batch-1")).rejects.toBeInstanceOf(
      StockImportBatchHasUnresolvedDuplicatesError
    );

    const batch = await repository.getById("batch-1");
    expect(batch?.confirmedAt).toBeNull();
    const transaction = await stockTransactionRepository.getById("stxn-1");
    expect(transaction?.trustStatus).toBe("Imported");
  });

  it("confirmAll flips every batch StockTransaction to Confirmed, with no BalanceSnapshot/Reconciliation", async () => {
    const testDb = createTestDb();
    await seedShareTradingAccount(testDb.db);
    const repository = new StockImportBatchRepository(testDb.db);
    await repository.create(
      { id: "batch-1", shareTradingAccountId: "sta-1", source: "x", createdAt: "2026-02-01T00:00:00.000Z" },
      [{ id: "stxn-1", scripCode: "AAPL", type: "Buy", quantity: "10", price: "150.00", occurredAt: "2026-01-15", description: "Buy" }]
    );

    const confirmed = await repository.confirmAll("batch-1");

    expect(confirmed.confirmedAt).not.toBeNull();
    expect((await new StockTransactionRepository(testDb.db).getById("stxn-1"))?.trustStatus).toBe("Confirmed");
  });

  it("confirmAll on an already-confirmed batch throws without side effects", async () => {
    const testDb = createTestDb();
    await seedShareTradingAccount(testDb.db);
    const repository = new StockImportBatchRepository(testDb.db);
    await repository.create(
      { id: "batch-1", shareTradingAccountId: "sta-1", source: "x", createdAt: "2026-02-01T00:00:00.000Z" },
      [{ id: "stxn-1", scripCode: "AAPL", type: "Buy", quantity: "10", price: "150.00", occurredAt: "2026-01-15", description: "Buy" }]
    );
    await repository.confirmAll("batch-1");

    await expect(repository.confirmAll("batch-1")).rejects.toBeInstanceOf(StockImportBatchAlreadyConfirmedError);
  });

  it("delete on an unconfirmed batch removes its StockTransactions and the batch row", async () => {
    const testDb = createTestDb();
    await seedShareTradingAccount(testDb.db);
    const repository = new StockImportBatchRepository(testDb.db);
    await repository.create(
      { id: "batch-1", shareTradingAccountId: "sta-1", source: "x", createdAt: "2026-02-01T00:00:00.000Z" },
      [{ id: "stxn-1", scripCode: "AAPL", type: "Buy", quantity: "10", price: "150.00", occurredAt: "2026-01-15", description: "Buy" }]
    );

    await repository.delete("batch-1");

    expect(await repository.getById("batch-1")).toBeNull();
    expect(await new StockTransactionRepository(testDb.db).getById("stxn-1")).toBeNull();
  });

  it("delete on an already-confirmed batch throws without side effects", async () => {
    const testDb = createTestDb();
    await seedShareTradingAccount(testDb.db);
    const repository = new StockImportBatchRepository(testDb.db);
    await repository.create(
      { id: "batch-1", shareTradingAccountId: "sta-1", source: "x", createdAt: "2026-02-01T00:00:00.000Z" },
      [{ id: "stxn-1", scripCode: "AAPL", type: "Buy", quantity: "10", price: "150.00", occurredAt: "2026-01-15", description: "Buy" }]
    );
    await repository.confirmAll("batch-1");

    await expect(repository.delete("batch-1")).rejects.toBeInstanceOf(StockImportBatchAlreadyConfirmedError);
    expect(await repository.getById("batch-1")).not.toBeNull();
  });
});
