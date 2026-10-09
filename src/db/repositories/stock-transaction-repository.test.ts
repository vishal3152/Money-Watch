import { describe, expect, it } from "vitest";

import { DatabaseConstraintError, StockTransactionNotFoundError } from "@/db/errors";
import { InstitutionRepository } from "@/db/repositories/institution-repository";
import { ShareTradingAccountRepository } from "@/db/repositories/share-trading-account-repository";
import { StockImportBatchRepository } from "@/db/repositories/stock-import-batch-repository";
import { StockTransactionRepository } from "@/db/repositories/stock-transaction-repository";
import { createTestDb } from "@/db/repositories/test-db";

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

describe("StockTransactionRepository", () => {
  it("creates, reads, and lists stock transactions for different companies on one account", async () => {
    const testDb = createTestDb();
    await seedShareTradingAccount(testDb.db);
    const repository = new StockTransactionRepository(testDb.db);

    await repository.create({
      id: "stxn-1",
      shareTradingAccountId: "sta-1",
      scripCode: "AAPL",
      type: "Buy",
      quantity: 10,
      pricePerUnitMinor: 15_000,
      occurredAt: "2026-01-01T10:00:00.000Z",
      description: "Buy AAPL",
      trustStatus: "Confirmed",
      importBatchId: null
    });
    await repository.create({
      id: "stxn-2",
      shareTradingAccountId: "sta-1",
      scripCode: "MSFT",
      type: "Buy",
      quantity: 5,
      pricePerUnitMinor: 30_000,
      occurredAt: "2026-01-02T10:00:00.000Z",
      description: "Buy MSFT",
      trustStatus: "Imported",
      importBatchId: null
    });

    const stockTransaction = await repository.getById("stxn-1");
    const listed = await repository.listByShareTradingAccountId("sta-1");

    expect(stockTransaction).toEqual({
      id: "stxn-1",
      shareTradingAccountId: "sta-1",
      scripCode: "AAPL",
      type: "Buy",
      quantity: 10,
      pricePerUnitMinor: 15_000,
      occurredAt: "2026-01-01T10:00:00.000Z",
      description: "Buy AAPL",
      trustStatus: "Confirmed",
      importBatchId: null,
      externalRef: null,
      possibleDuplicateOfTransactionId: null
    });
    expect(listed).toEqual([
      {
        id: "stxn-1",
        shareTradingAccountId: "sta-1",
        scripCode: "AAPL",
        type: "Buy",
        quantity: 10,
        pricePerUnitMinor: 15_000,
        occurredAt: "2026-01-01T10:00:00.000Z",
        description: "Buy AAPL",
        trustStatus: "Confirmed",
        importBatchId: null,
        externalRef: null,
        possibleDuplicateOfTransactionId: null
      },
      {
        id: "stxn-2",
        shareTradingAccountId: "sta-1",
        scripCode: "MSFT",
        type: "Buy",
        quantity: 5,
        pricePerUnitMinor: 30_000,
        occurredAt: "2026-01-02T10:00:00.000Z",
        description: "Buy MSFT",
        trustStatus: "Imported",
        importBatchId: null,
        externalRef: null,
        possibleDuplicateOfTransactionId: null
      }
    ]);
  });

  it("returns null for an unknown stock transaction id", async () => {
    const testDb = createTestDb();
    const repository = new StockTransactionRepository(testDb.db);

    expect(await repository.getById("missing")).toBeNull();
  });

  it("updates a stock transaction's fields and returns the updated entity", async () => {
    const testDb = createTestDb();
    await seedShareTradingAccount(testDb.db);
    const repository = new StockTransactionRepository(testDb.db);
    await repository.create({
      id: "stxn-1",
      shareTradingAccountId: "sta-1",
      scripCode: "AAPL",
      type: "Buy",
      quantity: 10,
      pricePerUnitMinor: 15_000,
      occurredAt: "2026-01-01T10:00:00.000Z",
      description: "Buy AAPL",
      trustStatus: "Confirmed",
      importBatchId: null
    });

    const updated = await repository.update("stxn-1", {
      quantity: 20,
      pricePerUnitMinor: 16_000,
      description: "Corrected quantity"
    });

    expect(updated).toEqual({
      id: "stxn-1",
      shareTradingAccountId: "sta-1",
      scripCode: "AAPL",
      type: "Buy",
      quantity: 20,
      pricePerUnitMinor: 16_000,
      occurredAt: "2026-01-01T10:00:00.000Z",
      description: "Corrected quantity",
      trustStatus: "Confirmed",
      importBatchId: null,
      externalRef: null,
      possibleDuplicateOfTransactionId: null
    });
    expect(await repository.getById("stxn-1")).toEqual(updated);
  });

  it("updating an Imported stock transaction leaves trustStatus and importBatchId untouched", async () => {
    const testDb = createTestDb();
    await seedShareTradingAccount(testDb.db);
    await new StockImportBatchRepository(testDb.db).create(
      { id: "batch-1", shareTradingAccountId: "sta-1", source: "MCP import", createdAt: "2026-01-01T10:00:00.000Z" },
      [
        {
          id: "stxn-1",
          scripCode: "AAPL",
          type: "Buy",
          quantity: "10",
          price: "150.00",
          occurredAt: "2026-01-01",
          description: "Buy AAPL"
        }
      ]
    );
    const repository = new StockTransactionRepository(testDb.db);

    const updated = await repository.update("stxn-1", { description: "Reviewed before confirming" });

    expect(updated.trustStatus).toBe("Imported");
    expect(updated.importBatchId).toBe("batch-1");
  });

  it("throws StockTransactionNotFoundError when updating an unknown id", async () => {
    const testDb = createTestDb();
    const repository = new StockTransactionRepository(testDb.db);

    await expect(repository.update("missing", { description: "x" })).rejects.toBeInstanceOf(
      StockTransactionNotFoundError
    );
  });

  it("deletes a stock transaction", async () => {
    const testDb = createTestDb();
    await seedShareTradingAccount(testDb.db);
    const repository = new StockTransactionRepository(testDb.db);
    await repository.create({
      id: "stxn-1",
      shareTradingAccountId: "sta-1",
      scripCode: "AAPL",
      type: "Buy",
      quantity: 10,
      pricePerUnitMinor: 15_000,
      occurredAt: "2026-01-01T10:00:00.000Z",
      description: "Buy AAPL",
      trustStatus: "Confirmed",
      importBatchId: null
    });

    await repository.delete("stxn-1");

    expect(await repository.getById("stxn-1")).toBeNull();
  });

  it("deleting an unknown id is a no-op", async () => {
    const testDb = createTestDb();
    const repository = new StockTransactionRepository(testDb.db);

    await expect(repository.delete("missing")).resolves.toBeUndefined();
  });

  it("rejects a stock transaction referencing an unknown share trading account", async () => {
    const testDb = createTestDb();
    const repository = new StockTransactionRepository(testDb.db);

    await expect(
      repository.create({
        id: "stxn-1",
        shareTradingAccountId: "missing-account",
        scripCode: "AAPL",
        type: "Buy",
        quantity: 10,
        pricePerUnitMinor: 15_000,
        occurredAt: "2026-01-01T10:00:00.000Z",
        description: "Buy AAPL",
        trustStatus: "Confirmed",
        importBatchId: null
      })
    ).rejects.toBeInstanceOf(DatabaseConstraintError);
  });

  describe("dismissSuspectedDuplicate", () => {
    it("clears possibleDuplicateOfTransactionId without changing any other field", async () => {
      const testDb = createTestDb();
      await seedShareTradingAccount(testDb.db);
      const repository = new StockTransactionRepository(testDb.db);
      await repository.create({
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
      await repository.create({
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

      const dismissed = await repository.dismissSuspectedDuplicate("flagged-stxn");

      expect(dismissed.possibleDuplicateOfTransactionId).toBeNull();
      expect(dismissed.description).toBe("Buy AAPL [REF]");
      const stored = await repository.getById("flagged-stxn");
      expect(stored?.possibleDuplicateOfTransactionId).toBeNull();
    });

    it("throws on an unknown stock transaction id", async () => {
      const testDb = createTestDb();
      const repository = new StockTransactionRepository(testDb.db);

      await expect(repository.dismissSuspectedDuplicate("missing")).rejects.toBeInstanceOf(
        StockTransactionNotFoundError
      );
    });
  });

  describe("listByImportBatchId", () => {
    it("returns only that batch's line items, not the whole Account's ledger", async () => {
      const testDb = createTestDb();
      await seedShareTradingAccount(testDb.db);
      await new StockImportBatchRepository(testDb.db).create(
        { id: "batch-1", shareTradingAccountId: "sta-1", source: "statement.pdf", createdAt: "2026-01-01T00:00:00.000Z" },
        [
          {
            id: "stxn-batch-1",
            scripCode: "AAPL",
            type: "Buy",
            quantity: "10",
            price: "150.00",
            occurredAt: "2026-01-01",
            description: "Buy AAPL"
          }
        ]
      );
      const repository = new StockTransactionRepository(testDb.db);
      await repository.create({
        id: "stxn-manual",
        shareTradingAccountId: "sta-1",
        scripCode: "MSFT",
        type: "Buy",
        quantity: 5,
        pricePerUnitMinor: 30_000,
        occurredAt: "2026-01-02T10:00:00.000Z",
        description: "Buy MSFT",
        trustStatus: "Confirmed",
        importBatchId: null
      });

      const lineItems = await repository.listByImportBatchId("batch-1");

      expect(lineItems.map((lineItem) => lineItem.id)).toEqual(["stxn-batch-1"]);
    });

    it("returns an empty list for an unknown import batch id", async () => {
      const testDb = createTestDb();

      expect(await new StockTransactionRepository(testDb.db).listByImportBatchId("missing")).toEqual([]);
    });
  });

  describe("sumQuantityByScripCode", () => {
    it("nets Buy and Sell quantities for one scrip in one ShareTradingAccount", async () => {
      const testDb = createTestDb();
      await seedShareTradingAccount(testDb.db);
      const repository = new StockTransactionRepository(testDb.db);
      await repository.create({
        id: "stxn-buy",
        shareTradingAccountId: "sta-1",
        scripCode: "AAPL",
        type: "Buy",
        quantity: 10,
        pricePerUnitMinor: 15_000,
        occurredAt: "2026-01-01T10:00:00.000Z",
        description: "Buy AAPL",
        trustStatus: "Confirmed",
        importBatchId: null
      });
      await repository.create({
        id: "stxn-sell",
        shareTradingAccountId: "sta-1",
        scripCode: "AAPL",
        type: "Sell",
        quantity: 3,
        pricePerUnitMinor: 18_000,
        occurredAt: "2026-02-01T10:00:00.000Z",
        description: "Sell AAPL",
        trustStatus: "Confirmed",
        importBatchId: null
      });
      // Different scrip on the same Account — must not contribute to the AAPL sum.
      await repository.create({
        id: "stxn-other-scrip",
        shareTradingAccountId: "sta-1",
        scripCode: "MSFT",
        type: "Buy",
        quantity: 100,
        pricePerUnitMinor: 30_000,
        occurredAt: "2026-02-02T10:00:00.000Z",
        description: "Buy MSFT",
        trustStatus: "Confirmed",
        importBatchId: null
      });

      expect(await repository.sumQuantityByScripCode("sta-1", "AAPL")).toBe(7);
    });

    it("excludes the given id, for checking a Sell being edited against its own prior effect", async () => {
      const testDb = createTestDb();
      await seedShareTradingAccount(testDb.db);
      const repository = new StockTransactionRepository(testDb.db);
      await repository.create({
        id: "stxn-buy",
        shareTradingAccountId: "sta-1",
        scripCode: "AAPL",
        type: "Buy",
        quantity: 10,
        pricePerUnitMinor: 15_000,
        occurredAt: "2026-01-01T10:00:00.000Z",
        description: "Buy AAPL",
        trustStatus: "Confirmed",
        importBatchId: null
      });
      await repository.create({
        id: "stxn-sell",
        shareTradingAccountId: "sta-1",
        scripCode: "AAPL",
        type: "Sell",
        quantity: 3,
        pricePerUnitMinor: 18_000,
        occurredAt: "2026-02-01T10:00:00.000Z",
        description: "Sell AAPL",
        trustStatus: "Confirmed",
        importBatchId: null
      });

      const withExclusion = await repository.sumQuantityByScripCode("sta-1", "AAPL", {
        excludeId: "stxn-sell"
      });

      expect(withExclusion).toBe(10);
    });

    it("returns 0 for a scrip with no StockTransactions", async () => {
      const testDb = createTestDb();
      await seedShareTradingAccount(testDb.db);

      expect(
        await new StockTransactionRepository(testDb.db).sumQuantityByScripCode("sta-1", "AAPL")
      ).toBe(0);
    });
  });

  describe("listByShareTradingAccountIds", () => {
    it("returns every listed Account's stock transactions in one call, grouped by Account", async () => {
      const testDb = createTestDb();
      await seedShareTradingAccount(testDb.db);
      await new ShareTradingAccountRepository(testDb.db).create({
        id: "sta-2",
        institutionId: "inst-1",
        name: "India Equities",
        accountNumber: null,
        currencyCode: "INR"
      });
      await new ShareTradingAccountRepository(testDb.db).create({
        id: "sta-3",
        institutionId: "inst-1",
        name: "Untouched",
        accountNumber: null,
        currencyCode: "USD"
      });
      const repository = new StockTransactionRepository(testDb.db);

      await repository.create({
        id: "stxn-b",
        shareTradingAccountId: "sta-2",
        scripCode: "INFY",
        type: "Buy",
        quantity: 3,
        pricePerUnitMinor: 10_000,
        occurredAt: "2026-01-02T10:00:00.000Z",
        description: "Buy INFY",
        trustStatus: "Confirmed",
        importBatchId: null
      });
      await repository.create({
        id: "stxn-a",
        shareTradingAccountId: "sta-1",
        scripCode: "AAPL",
        type: "Buy",
        quantity: 10,
        pricePerUnitMinor: 15_000,
        occurredAt: "2026-01-01T10:00:00.000Z",
        description: "Buy AAPL",
        trustStatus: "Confirmed",
        importBatchId: null
      });
      await repository.create({
        id: "stxn-c",
        shareTradingAccountId: "sta-3",
        scripCode: "TSLA",
        type: "Buy",
        quantity: 1,
        pricePerUnitMinor: 20_000,
        occurredAt: "2026-01-03T10:00:00.000Z",
        description: "Buy TSLA",
        trustStatus: "Confirmed",
        importBatchId: null
      });

      const rows = await repository.listByShareTradingAccountIds(["sta-1", "sta-2"]);

      expect(rows.map((row) => [row.shareTradingAccountId, row.id])).toEqual([
        ["sta-1", "stxn-a"],
        ["sta-2", "stxn-b"]
      ]);
    });

    it("orders each Account's rows the same way listByShareTradingAccountId does", async () => {
      const testDb = createTestDb();
      await seedShareTradingAccount(testDb.db);
      const repository = new StockTransactionRepository(testDb.db);

      await repository.create({
        id: "stxn-late",
        shareTradingAccountId: "sta-1",
        scripCode: "AAPL",
        type: "Sell",
        quantity: 2,
        pricePerUnitMinor: 18_000,
        occurredAt: "2026-03-01T10:00:00.000Z",
        description: "Sell AAPL",
        trustStatus: "Confirmed",
        importBatchId: null
      });
      await repository.create({
        id: "stxn-early",
        shareTradingAccountId: "sta-1",
        scripCode: "AAPL",
        type: "Buy",
        quantity: 10,
        pricePerUnitMinor: 15_000,
        occurredAt: "2026-01-01T10:00:00.000Z",
        description: "Buy AAPL",
        trustStatus: "Confirmed",
        importBatchId: null
      });

      expect(await repository.listByShareTradingAccountIds(["sta-1"])).toEqual(
        await repository.listByShareTradingAccountId("sta-1")
      );
    });

    it("returns an empty list for no Account ids", async () => {
      const testDb = createTestDb();

      expect(await new StockTransactionRepository(testDb.db).listByShareTradingAccountIds([])).toEqual(
        []
      );
    });
  });
});
