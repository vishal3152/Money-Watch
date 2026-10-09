import { randomUUID } from "node:crypto";

import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";

import { StockTransactionNotFoundError } from "@/db/errors";
import { PgInstitutionRepository } from "@/db/postgres/repositories/institution-repository";
import { PgShareTradingAccountRepository } from "@/db/postgres/repositories/share-trading-account-repository";
import { PgStockImportBatchRepository } from "@/db/postgres/repositories/stock-import-batch-repository";
import { PgStockTransactionRepository } from "@/db/postgres/repositories/stock-transaction-repository";

const CONNECTION_STRING =
  process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

const admin = postgres(CONNECTION_STRING, { max: 1 });

afterAll(async () => {
  await admin.end();
});

describe("PgStockTransactionRepository", () => {
  it("listByShareTradingAccountId() only returns StockTransactions belonging to the scoped Owner", async () => {
    const ownerA = randomUUID();
    const ownerB = randomUUID();
    const institutionA = { id: randomUUID(), name: "Owner A Broker" };
    const institutionB = { id: randomUUID(), name: "Owner B Broker" };
    const shareTradingAccountA = {
      id: randomUUID(),
      institutionId: institutionA.id,
      name: "Owner A Equities",
      accountNumber: null,
      currencyCode: "USD"
    };
    const shareTradingAccountB = {
      id: randomUUID(),
      institutionId: institutionB.id,
      name: "Owner B Equities",
      accountNumber: null,
      currencyCode: "USD"
    };
    const stockTransactionA = {
      id: randomUUID(),
      shareTradingAccountId: shareTradingAccountA.id,
      scripCode: "AAPL",
      type: "Buy" as const,
      quantity: 10,
      pricePerUnitMinor: 15_000,
      occurredAt: "2026-01-01T10:00:00.000Z",
      description: "Buy AAPL",
      trustStatus: "Confirmed" as const,
      importBatchId: null,
      externalRef: null,
      possibleDuplicateOfTransactionId: null
    };
    const stockTransactionB = {
      id: randomUUID(),
      shareTradingAccountId: shareTradingAccountB.id,
      scripCode: "MSFT",
      type: "Buy" as const,
      quantity: 5,
      pricePerUnitMinor: 30_000,
      occurredAt: "2026-01-02T10:00:00.000Z",
      description: "Buy MSFT",
      trustStatus: "Confirmed" as const,
      importBatchId: null
    };

    try {
      await new PgInstitutionRepository(CONNECTION_STRING, ownerA).create(institutionA);
      await new PgInstitutionRepository(CONNECTION_STRING, ownerB).create(institutionB);
      await new PgShareTradingAccountRepository(CONNECTION_STRING, ownerA).create(shareTradingAccountA);
      await new PgShareTradingAccountRepository(CONNECTION_STRING, ownerB).create(shareTradingAccountB);

      const repoA = new PgStockTransactionRepository(CONNECTION_STRING, ownerA);
      const repoB = new PgStockTransactionRepository(CONNECTION_STRING, ownerB);
      await repoA.create(stockTransactionA);
      await repoB.create(stockTransactionB);

      expect(await repoA.listByShareTradingAccountId(shareTradingAccountA.id)).toEqual([stockTransactionA]);
      expect(await repoA.getById(stockTransactionB.id)).toBeNull();
    } finally {
      await admin`delete from stock_transactions where id in (${stockTransactionA.id}, ${stockTransactionB.id})`;
      await admin`delete from share_trading_accounts where id in (${shareTradingAccountA.id}, ${shareTradingAccountB.id})`;
      await admin`delete from institutions where id in (${institutionA.id}, ${institutionB.id})`;
    }
  });

  it("update() changes an owned StockTransaction's fields", async () => {
    const ownerA = randomUUID();
    const institutionA = { id: randomUUID(), name: "Owner A Broker" };
    const shareTradingAccountA = {
      id: randomUUID(),
      institutionId: institutionA.id,
      name: "Owner A Equities",
      accountNumber: null,
      currencyCode: "USD"
    };
    const stockTransactionId = randomUUID();

    try {
      await new PgInstitutionRepository(CONNECTION_STRING, ownerA).create(institutionA);
      await new PgShareTradingAccountRepository(CONNECTION_STRING, ownerA).create(shareTradingAccountA);
      const repoA = new PgStockTransactionRepository(CONNECTION_STRING, ownerA);
      await repoA.create({
        id: stockTransactionId,
        shareTradingAccountId: shareTradingAccountA.id,
        scripCode: "AAPL",
        type: "Buy",
        quantity: 10,
        pricePerUnitMinor: 15_000,
        occurredAt: "2026-01-01T10:00:00.000Z",
        description: "Buy AAPL",
        trustStatus: "Confirmed",
        importBatchId: null
      });

      const updated = await repoA.update(stockTransactionId, { quantity: 20, description: "Corrected" });

      expect(updated.quantity).toBe(20);
      expect(updated.description).toBe("Corrected");
      expect(await repoA.getById(stockTransactionId)).toEqual(updated);
    } finally {
      await admin`delete from stock_transactions where id = ${stockTransactionId}`;
      await admin`delete from share_trading_accounts where id = ${shareTradingAccountA.id}`;
      await admin`delete from institutions where id = ${institutionA.id}`;
    }
  });

  it("update() does not change another Owner's StockTransaction, even though the id exists", async () => {
    const ownerA = randomUUID();
    const ownerB = randomUUID();
    const institutionB = { id: randomUUID(), name: "Owner B Broker" };
    const shareTradingAccountB = {
      id: randomUUID(),
      institutionId: institutionB.id,
      name: "Owner B Equities",
      accountNumber: null,
      currencyCode: "USD"
    };
    const stockTransactionId = randomUUID();

    try {
      await new PgInstitutionRepository(CONNECTION_STRING, ownerB).create(institutionB);
      await new PgShareTradingAccountRepository(CONNECTION_STRING, ownerB).create(shareTradingAccountB);
      const repoB = new PgStockTransactionRepository(CONNECTION_STRING, ownerB);
      await repoB.create({
        id: stockTransactionId,
        shareTradingAccountId: shareTradingAccountB.id,
        scripCode: "AAPL",
        type: "Buy",
        quantity: 10,
        pricePerUnitMinor: 15_000,
        occurredAt: "2026-01-01T10:00:00.000Z",
        description: "Owner B's Buy",
        trustStatus: "Confirmed",
        importBatchId: null
      });

      const repoA = new PgStockTransactionRepository(CONNECTION_STRING, ownerA);
      await expect(repoA.update(stockTransactionId, { description: "Hijacked" })).rejects.toThrow();
      expect((await repoB.getById(stockTransactionId))?.description).toBe("Owner B's Buy");
    } finally {
      await admin`delete from stock_transactions where id = ${stockTransactionId}`;
      await admin`delete from share_trading_accounts where id = ${shareTradingAccountB.id}`;
      await admin`delete from institutions where id = ${institutionB.id}`;
    }
  });

  it("delete() removes an owned StockTransaction", async () => {
    const ownerA = randomUUID();
    const institutionA = { id: randomUUID(), name: "Owner A Broker" };
    const shareTradingAccountA = {
      id: randomUUID(),
      institutionId: institutionA.id,
      name: "Owner A Equities",
      accountNumber: null,
      currencyCode: "USD"
    };
    const stockTransactionId = randomUUID();

    try {
      await new PgInstitutionRepository(CONNECTION_STRING, ownerA).create(institutionA);
      await new PgShareTradingAccountRepository(CONNECTION_STRING, ownerA).create(shareTradingAccountA);
      const repoA = new PgStockTransactionRepository(CONNECTION_STRING, ownerA);
      await repoA.create({
        id: stockTransactionId,
        shareTradingAccountId: shareTradingAccountA.id,
        scripCode: "AAPL",
        type: "Buy",
        quantity: 10,
        pricePerUnitMinor: 15_000,
        occurredAt: "2026-01-01T10:00:00.000Z",
        description: "Buy AAPL",
        trustStatus: "Confirmed",
        importBatchId: null
      });

      await repoA.delete(stockTransactionId);

      expect(await repoA.getById(stockTransactionId)).toBeNull();
    } finally {
      await admin`delete from stock_transactions where id = ${stockTransactionId}`;
      await admin`delete from share_trading_accounts where id = ${shareTradingAccountA.id}`;
      await admin`delete from institutions where id = ${institutionA.id}`;
    }
  });

  it("delete() does not remove another Owner's StockTransaction, even though the id exists", async () => {
    const ownerA = randomUUID();
    const ownerB = randomUUID();
    const institutionB = { id: randomUUID(), name: "Owner B Broker" };
    const shareTradingAccountB = {
      id: randomUUID(),
      institutionId: institutionB.id,
      name: "Owner B Equities",
      accountNumber: null,
      currencyCode: "USD"
    };
    const stockTransactionId = randomUUID();

    try {
      await new PgInstitutionRepository(CONNECTION_STRING, ownerB).create(institutionB);
      await new PgShareTradingAccountRepository(CONNECTION_STRING, ownerB).create(shareTradingAccountB);
      const repoB = new PgStockTransactionRepository(CONNECTION_STRING, ownerB);
      await repoB.create({
        id: stockTransactionId,
        shareTradingAccountId: shareTradingAccountB.id,
        scripCode: "AAPL",
        type: "Buy",
        quantity: 10,
        pricePerUnitMinor: 15_000,
        occurredAt: "2026-01-01T10:00:00.000Z",
        description: "Owner B's Buy",
        trustStatus: "Confirmed",
        importBatchId: null
      });

      const repoA = new PgStockTransactionRepository(CONNECTION_STRING, ownerA);
      await repoA.delete(stockTransactionId);

      expect(await repoB.getById(stockTransactionId)).not.toBeNull();
    } finally {
      await admin`delete from stock_transactions where id = ${stockTransactionId}`;
      await admin`delete from share_trading_accounts where id = ${shareTradingAccountB.id}`;
      await admin`delete from institutions where id = ${institutionB.id}`;
    }
  });

  it("rejects a StockTransaction referencing another Owner's ShareTradingAccount, even though the id exists", async () => {
    const ownerA = randomUUID();
    const ownerB = randomUUID();
    const institutionB = { id: randomUUID(), name: "Owner B Broker" };
    const shareTradingAccountB = {
      id: randomUUID(),
      institutionId: institutionB.id,
      name: "Owner B Equities",
      accountNumber: null,
      currencyCode: "USD"
    };

    try {
      await new PgInstitutionRepository(CONNECTION_STRING, ownerB).create(institutionB);
      await new PgShareTradingAccountRepository(CONNECTION_STRING, ownerB).create(shareTradingAccountB);

      const repoA = new PgStockTransactionRepository(CONNECTION_STRING, ownerA);

      await expect(
        repoA.create({
          id: randomUUID(),
          shareTradingAccountId: shareTradingAccountB.id,
          scripCode: "AAPL",
          type: "Buy",
          quantity: 10,
          pricePerUnitMinor: 15_000,
          occurredAt: "2026-01-01T10:00:00.000Z",
          description: "Cross-owner Buy",
          trustStatus: "Confirmed",
          importBatchId: null
        })
      ).rejects.toThrow();
    } finally {
      await admin`delete from share_trading_accounts where id = ${shareTradingAccountB.id}`;
      await admin`delete from institutions where id = ${institutionB.id}`;
    }
  });

  it("listByShareTradingAccountIds() batches several Accounts and excludes another Owner's rows", async () => {
    const ownerA = randomUUID();
    const ownerB = randomUUID();
    const institutionA = { id: randomUUID(), name: "Owner A Broker" };
    const institutionB = { id: randomUUID(), name: "Owner B Broker" };
    const accountA1 = {
      id: randomUUID(),
      institutionId: institutionA.id,
      name: "Owner A US",
      accountNumber: null,
      currencyCode: "USD"
    };
    const accountA2 = {
      id: randomUUID(),
      institutionId: institutionA.id,
      name: "Owner A India",
      accountNumber: null,
      currencyCode: "INR"
    };
    // Same id list is passed to both Owners' repositories below, so a missing
    // owner_id predicate would leak this row into Owner A's result.
    const accountB = {
      id: randomUUID(),
      institutionId: institutionB.id,
      name: "Owner B Equities",
      accountNumber: null,
      currencyCode: "USD"
    };
    const rowA1 = {
      id: randomUUID(),
      shareTradingAccountId: accountA1.id,
      scripCode: "AAPL",
      type: "Buy" as const,
      quantity: 10,
      pricePerUnitMinor: 15_000,
      occurredAt: "2026-01-01T10:00:00.000Z",
      description: "Buy AAPL",
      trustStatus: "Confirmed" as const,
      importBatchId: null,
      externalRef: null,
      possibleDuplicateOfTransactionId: null
    };
    const rowA2 = {
      id: randomUUID(),
      shareTradingAccountId: accountA2.id,
      scripCode: "INFY",
      type: "Buy" as const,
      quantity: 3,
      pricePerUnitMinor: 10_000,
      occurredAt: "2026-01-02T10:00:00.000Z",
      description: "Buy INFY",
      trustStatus: "Confirmed" as const,
      importBatchId: null,
      externalRef: null,
      possibleDuplicateOfTransactionId: null
    };
    const rowB = {
      id: randomUUID(),
      shareTradingAccountId: accountB.id,
      scripCode: "TSLA",
      type: "Buy" as const,
      quantity: 1,
      pricePerUnitMinor: 20_000,
      occurredAt: "2026-01-03T10:00:00.000Z",
      description: "Buy TSLA",
      trustStatus: "Confirmed" as const,
      importBatchId: null
    };

    try {
      await new PgInstitutionRepository(CONNECTION_STRING, ownerA).create(institutionA);
      await new PgInstitutionRepository(CONNECTION_STRING, ownerB).create(institutionB);
      const accountsA = new PgShareTradingAccountRepository(CONNECTION_STRING, ownerA);
      await accountsA.create(accountA1);
      await accountsA.create(accountA2);
      await new PgShareTradingAccountRepository(CONNECTION_STRING, ownerB).create(accountB);

      const repoA = new PgStockTransactionRepository(CONNECTION_STRING, ownerA);
      const repoB = new PgStockTransactionRepository(CONNECTION_STRING, ownerB);
      await repoA.create(rowA1);
      await repoA.create(rowA2);
      await repoB.create(rowB);

      // Grouped by shareTradingAccountId, which for random UUIDs is not the
      // order the Accounts were created in — sort the expectation the same way.
      expect(
        await repoA.listByShareTradingAccountIds([accountA1.id, accountA2.id, accountB.id])
      ).toEqual(
        [rowA1, rowA2].sort((left, right) =>
          left.shareTradingAccountId.localeCompare(right.shareTradingAccountId)
        )
      );
      expect(await repoA.listByShareTradingAccountIds([])).toEqual([]);
    } finally {
      await admin`delete from stock_transactions where id in (${rowA1.id}, ${rowA2.id}, ${rowB.id})`;
      await admin`delete from share_trading_accounts where id in (${accountA1.id}, ${accountA2.id}, ${accountB.id})`;
      await admin`delete from institutions where id in (${institutionA.id}, ${institutionB.id})`;
    }
  });

  it("listByImportBatchId() does not leak another Owner's StockTransactions for a batch id it does not own", async () => {
    const ownerA = randomUUID();
    const ownerB = randomUUID();
    const institutionB = { id: randomUUID(), name: "Owner B Broker" };
    const shareTradingAccountB = {
      id: randomUUID(),
      institutionId: institutionB.id,
      name: "Owner B Equities",
      accountNumber: null,
      currencyCode: "USD"
    };
    const batchId = randomUUID();
    const lineItemId = randomUUID();

    try {
      await new PgInstitutionRepository(CONNECTION_STRING, ownerB).create(institutionB);
      await new PgShareTradingAccountRepository(CONNECTION_STRING, ownerB).create(shareTradingAccountB);
      await new PgStockImportBatchRepository(CONNECTION_STRING, ownerB).create(
        { id: batchId, shareTradingAccountId: shareTradingAccountB.id, source: "statement.pdf", createdAt: "2026-01-01T00:00:00.000Z" },
        [
          {
            id: lineItemId,
            scripCode: "AAPL",
            type: "Buy",
            quantity: "10",
            price: "150.00",
            occurredAt: "2026-01-01",
            description: "Buy AAPL"
          }
        ]
      );

      const repoA = new PgStockTransactionRepository(CONNECTION_STRING, ownerA);

      expect(await repoA.listByImportBatchId(batchId)).toEqual([]);
    } finally {
      await admin`delete from stock_transactions where id = ${lineItemId}`;
      await admin`delete from stock_import_batches where id = ${batchId}`;
      await admin`delete from share_trading_accounts where id = ${shareTradingAccountB.id}`;
      await admin`delete from institutions where id = ${institutionB.id}`;
    }
  });

  describe("sumQuantityByScripCode", () => {
    it("nets Buy and Sell quantities for one scrip, scoped to the calling Owner", async () => {
      const ownerA = randomUUID();
      const institutionA = { id: randomUUID(), name: "Owner A Broker" };
      const shareTradingAccountA = {
        id: randomUUID(),
        institutionId: institutionA.id,
        name: "Owner A Equities",
        accountNumber: null,
        currencyCode: "USD"
      };
      const buyId = randomUUID();
      const sellId = randomUUID();

      try {
        await new PgInstitutionRepository(CONNECTION_STRING, ownerA).create(institutionA);
        await new PgShareTradingAccountRepository(CONNECTION_STRING, ownerA).create(shareTradingAccountA);
        const repoA = new PgStockTransactionRepository(CONNECTION_STRING, ownerA);
        await repoA.create({
          id: buyId,
          shareTradingAccountId: shareTradingAccountA.id,
          scripCode: "AAPL",
          type: "Buy",
          quantity: 10,
          pricePerUnitMinor: 15_000,
          occurredAt: "2026-01-01T10:00:00.000Z",
          description: "Buy AAPL",
          trustStatus: "Confirmed",
          importBatchId: null
        });
        await repoA.create({
          id: sellId,
          shareTradingAccountId: shareTradingAccountA.id,
          scripCode: "AAPL",
          type: "Sell",
          quantity: 3,
          pricePerUnitMinor: 18_000,
          occurredAt: "2026-02-01T10:00:00.000Z",
          description: "Sell AAPL",
          trustStatus: "Confirmed",
          importBatchId: null
        });

        expect(await repoA.sumQuantityByScripCode(shareTradingAccountA.id, "AAPL")).toBe(7);
        expect(
          await repoA.sumQuantityByScripCode(shareTradingAccountA.id, "AAPL", { excludeId: sellId })
        ).toBe(10);
      } finally {
        await admin`delete from stock_transactions where id in (${buyId}, ${sellId})`;
        await admin`delete from share_trading_accounts where id = ${shareTradingAccountA.id}`;
        await admin`delete from institutions where id = ${institutionA.id}`;
      }
    });

    it("does not leak another Owner's StockTransactions for a ShareTradingAccount id it does not own", async () => {
      const ownerA = randomUUID();
      const ownerB = randomUUID();
      const institutionB = { id: randomUUID(), name: "Owner B Broker" };
      const shareTradingAccountB = {
        id: randomUUID(),
        institutionId: institutionB.id,
        name: "Owner B Equities",
        accountNumber: null,
        currencyCode: "USD"
      };
      const stockTransactionId = randomUUID();

      try {
        await new PgInstitutionRepository(CONNECTION_STRING, ownerB).create(institutionB);
        await new PgShareTradingAccountRepository(CONNECTION_STRING, ownerB).create(shareTradingAccountB);
        await new PgStockTransactionRepository(CONNECTION_STRING, ownerB).create({
          id: stockTransactionId,
          shareTradingAccountId: shareTradingAccountB.id,
          scripCode: "AAPL",
          type: "Buy",
          quantity: 10,
          pricePerUnitMinor: 15_000,
          occurredAt: "2026-01-01T10:00:00.000Z",
          description: "Owner B's Buy",
          trustStatus: "Confirmed",
          importBatchId: null
        });

        const repoA = new PgStockTransactionRepository(CONNECTION_STRING, ownerA);

        expect(await repoA.sumQuantityByScripCode(shareTradingAccountB.id, "AAPL")).toBe(0);
      } finally {
        await admin`delete from stock_transactions where id = ${stockTransactionId}`;
        await admin`delete from share_trading_accounts where id = ${shareTradingAccountB.id}`;
        await admin`delete from institutions where id = ${institutionB.id}`;
      }
    });
  });

  describe("dismissSuspectedDuplicate", () => {
    it("clears possibleDuplicateOfTransactionId without changing any other field", async () => {
      const ownerId = randomUUID();
      const institution = { id: randomUUID(), name: "Owner Broker" };
      const shareTradingAccount = {
        id: randomUUID(),
        institutionId: institution.id,
        name: "Owner Equities",
        accountNumber: null,
        currencyCode: "USD"
      };
      const repository = new PgStockTransactionRepository(CONNECTION_STRING, ownerId);
      const originalId = randomUUID();
      const flaggedId = randomUUID();

      try {
        await new PgInstitutionRepository(CONNECTION_STRING, ownerId).create(institution);
        await new PgShareTradingAccountRepository(CONNECTION_STRING, ownerId).create(shareTradingAccount);
        await repository.create({
          id: originalId,
          shareTradingAccountId: shareTradingAccount.id,
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
          id: flaggedId,
          shareTradingAccountId: shareTradingAccount.id,
          scripCode: "AAPL",
          type: "Buy",
          quantity: 10,
          pricePerUnitMinor: 15_000,
          occurredAt: "2026-01-15T00:00:00.000Z",
          description: "Buy AAPL [REF]",
          trustStatus: "Imported",
          importBatchId: null,
          possibleDuplicateOfTransactionId: originalId
        });

        const dismissed = await repository.dismissSuspectedDuplicate(flaggedId);

        expect(dismissed.possibleDuplicateOfTransactionId).toBeNull();
        expect(dismissed.description).toBe("Buy AAPL [REF]");
        const stored = await repository.getById(flaggedId);
        expect(stored?.possibleDuplicateOfTransactionId).toBeNull();
      } finally {
        await admin`delete from stock_transactions where id in (${originalId}, ${flaggedId})`;
        await admin`delete from share_trading_accounts where id = ${shareTradingAccount.id}`;
        await admin`delete from institutions where id = ${institution.id}`;
      }
    });

    it("throws on an unknown stock transaction id", async () => {
      const ownerId = randomUUID();
      const repository = new PgStockTransactionRepository(CONNECTION_STRING, ownerId);

      await expect(repository.dismissSuspectedDuplicate(randomUUID())).rejects.toBeInstanceOf(
        StockTransactionNotFoundError
      );
    });
  });
});
