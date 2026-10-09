import { describe, expect, it } from "vitest";

import {
  DatabaseConstraintError,
  EntityHasDependentsError,
  ShareTradingAccountNotFoundError
} from "@/db/errors";
import { InstitutionRepository } from "@/db/repositories/institution-repository";
import { ShareTradingAccountRepository } from "@/db/repositories/share-trading-account-repository";
import { StockImportBatchRepository } from "@/db/repositories/stock-import-batch-repository";
import { StockTransactionRepository } from "@/db/repositories/stock-transaction-repository";
import { createTestDb } from "@/db/repositories/test-db";

describe("ShareTradingAccountRepository", () => {
  it("creates, reads, and lists share trading accounts", async () => {
    const testDb = createTestDb();
    const institutionRepository = new InstitutionRepository(testDb.db);
    await institutionRepository.create({ id: "inst-1", name: "Broker One" });
    await institutionRepository.create({ id: "inst-2", name: "Broker Two" });
    const repository = new ShareTradingAccountRepository(testDb.db);

    await repository.create({
      id: "sta-1",
      institutionId: "inst-1",
      name: "US Equities",
      accountNumber: null,
      currencyCode: "USD"
    });
    await repository.create({
      id: "sta-2",
      institutionId: "inst-2",
      name: "NSE Equities",
      accountNumber: "DEMAT123",
      currencyCode: "INR"
    });

    const shareTradingAccount = await repository.getById("sta-1");
    const allShareTradingAccounts = await repository.listAll();

    expect(shareTradingAccount).toEqual({
      id: "sta-1",
      institutionId: "inst-1",
      name: "US Equities",
      accountNumber: null,
      currencyCode: "USD"
    });
    expect(allShareTradingAccounts).toEqual([
      {
        id: "sta-1",
        institutionId: "inst-1",
        name: "US Equities",
        accountNumber: null,
        currencyCode: "USD"
      },
      {
        id: "sta-2",
        institutionId: "inst-2",
        name: "NSE Equities",
        accountNumber: "DEMAT123",
        currencyCode: "INR"
      }
    ]);
  });

  it("listByInstitutionId() returns only ShareTradingAccounts for that Institution", async () => {
    const testDb = createTestDb();
    const institutionRepository = new InstitutionRepository(testDb.db);
    await institutionRepository.create({ id: "inst-1", name: "Broker One" });
    await institutionRepository.create({ id: "inst-2", name: "Broker Two" });
    const repository = new ShareTradingAccountRepository(testDb.db);

    await repository.create({
      id: "sta-1",
      institutionId: "inst-1",
      name: "US Equities",
      accountNumber: null,
      currencyCode: "USD"
    });
    await repository.create({
      id: "sta-2",
      institutionId: "inst-2",
      name: "NSE Equities",
      accountNumber: "DEMAT123",
      currencyCode: "INR"
    });

    expect(await repository.listByInstitutionId("inst-1")).toEqual([
      {
        id: "sta-1",
        institutionId: "inst-1",
        name: "US Equities",
        accountNumber: null,
        currencyCode: "USD"
      }
    ]);
  });

  it("returns null for an unknown share trading account id", async () => {
    const testDb = createTestDb();
    const repository = new ShareTradingAccountRepository(testDb.db);

    expect(await repository.getById("missing")).toBeNull();
  });

  it("rejects a share trading account referencing an unknown institution", async () => {
    const testDb = createTestDb();
    const repository = new ShareTradingAccountRepository(testDb.db);

    await expect(
      repository.create({
        id: "sta-1",
        institutionId: "missing-institution",
        name: "US Equities",
        accountNumber: null,
        currencyCode: "USD"
      })
    ).rejects.toBeInstanceOf(DatabaseConstraintError);
  });

  it("updates a ShareTradingAccount's name and account number", async () => {
    const testDb = createTestDb();
    await new InstitutionRepository(testDb.db).create({ id: "inst-1", name: "Broker One" });
    const repository = new ShareTradingAccountRepository(testDb.db);
    await repository.create({
      id: "sta-1",
      institutionId: "inst-1",
      name: "US Equities",
      accountNumber: null,
      currencyCode: "USD"
    });

    const updated = await repository.update("sta-1", {
      name: "US Equities (Renamed)",
      accountNumber: "DEMAT999"
    });

    const expected = {
      id: "sta-1",
      institutionId: "inst-1",
      name: "US Equities (Renamed)",
      accountNumber: "DEMAT999",
      currencyCode: "USD"
    };
    expect(updated).toEqual(expected);
    expect(await repository.getById("sta-1")).toEqual(expected);
  });

  it("rejects updating an unknown ShareTradingAccount", async () => {
    const testDb = createTestDb();
    const repository = new ShareTradingAccountRepository(testDb.db);

    await expect(repository.update("missing", { name: "New Name" })).rejects.toBeInstanceOf(
      ShareTradingAccountNotFoundError
    );
  });

  it("deletes a ShareTradingAccount with no StockTransactions or StockImportBatches", async () => {
    const testDb = createTestDb();
    await new InstitutionRepository(testDb.db).create({ id: "inst-1", name: "Broker One" });
    const repository = new ShareTradingAccountRepository(testDb.db);
    await repository.create({
      id: "sta-1",
      institutionId: "inst-1",
      name: "US Equities",
      accountNumber: null,
      currencyCode: "USD"
    });

    await repository.delete("sta-1");

    expect(await repository.getById("sta-1")).toBeNull();
  });

  it("rejects deleting a ShareTradingAccount that still has StockTransactions", async () => {
    const testDb = createTestDb();
    await new InstitutionRepository(testDb.db).create({ id: "inst-1", name: "Broker One" });
    const repository = new ShareTradingAccountRepository(testDb.db);
    await repository.create({
      id: "sta-1",
      institutionId: "inst-1",
      name: "US Equities",
      accountNumber: null,
      currencyCode: "USD"
    });
    await new StockTransactionRepository(testDb.db).create({
      id: "st-1",
      shareTradingAccountId: "sta-1",
      scripCode: "AAPL",
      type: "Buy",
      quantity: 10,
      pricePerUnitMinor: 15000,
      occurredAt: "2026-01-01T00:00:00.000Z",
      description: "Initial buy",
      trustStatus: "Confirmed",
      importBatchId: null
    });

    await expect(repository.delete("sta-1")).rejects.toBeInstanceOf(EntityHasDependentsError);
    expect(await repository.getById("sta-1")).not.toBeNull();
  });

  it("rejects deleting a ShareTradingAccount that still has a StockImportBatch", async () => {
    const testDb = createTestDb();
    await new InstitutionRepository(testDb.db).create({ id: "inst-1", name: "Broker One" });
    const repository = new ShareTradingAccountRepository(testDb.db);
    await repository.create({
      id: "sta-1",
      institutionId: "inst-1",
      name: "US Equities",
      accountNumber: null,
      currencyCode: "USD"
    });
    await new StockImportBatchRepository(testDb.db).create(
      { id: "batch-1", shareTradingAccountId: "sta-1", source: "mcp", createdAt: "2026-01-01T00:00:00.000Z" },
      [
        {
          id: "st-1",
          scripCode: "AAPL",
          type: "Buy",
          quantity: "10",
          price: "150.00",
          occurredAt: "2026-01-01",
          description: "Imported buy"
        }
      ]
    );

    await expect(repository.delete("sta-1")).rejects.toBeInstanceOf(EntityHasDependentsError);
  });
});
