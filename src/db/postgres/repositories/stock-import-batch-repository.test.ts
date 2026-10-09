import { randomUUID } from "node:crypto";

import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";

import {
  DatabaseConstraintError,
  StockImportBatchAlreadyConfirmedError,
  StockImportBatchHasUnresolvedDuplicatesError
} from "@/db/errors";
import { PgInstitutionRepository } from "@/db/postgres/repositories/institution-repository";
import { PgShareTradingAccountRepository } from "@/db/postgres/repositories/share-trading-account-repository";
import { PgStockImportBatchRepository } from "@/db/postgres/repositories/stock-import-batch-repository";
import { PgStockTransactionRepository } from "@/db/postgres/repositories/stock-transaction-repository";
import { EmptyStockImportBatchError } from "@/domain/stock-import-batch";

const CONNECTION_STRING =
  process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

const admin = postgres(CONNECTION_STRING, { max: 1 });

afterAll(async () => {
  await admin.end();
});

async function seedShareTradingAccount(ownerId: string) {
  const institution = { id: randomUUID(), name: "Owner Broker" };
  await new PgInstitutionRepository(CONNECTION_STRING, ownerId).create(institution);
  const shareTradingAccount = {
    id: randomUUID(),
    institutionId: institution.id,
    name: "Owner Equities",
    accountNumber: null,
    currencyCode: "USD"
  };
  await new PgShareTradingAccountRepository(CONNECTION_STRING, ownerId).create(shareTradingAccount);
  return { institution, shareTradingAccount };
}

describe("PgStockImportBatchRepository", () => {
  it("creates a batch and its Imported StockTransactions, scoped to the owner", async () => {
    const ownerId = randomUUID();
    const { institution, shareTradingAccount } = await seedShareTradingAccount(ownerId);
    const repository = new PgStockImportBatchRepository(CONNECTION_STRING, ownerId);
    const batchId = randomUUID();
    const stxnId = randomUUID();

    try {
      const batch = await repository.create(
        { id: batchId, shareTradingAccountId: shareTradingAccount.id, source: "x", createdAt: "2026-02-01T00:00:00.000Z" },
        [
          {
            id: stxnId,
            scripCode: "aapl",
            type: "Buy",
            quantity: "10",
            price: "150.00",
            occurredAt: "2026-01-15",
            description: "Buy AAPL"
          }
        ]
      );

      expect(batch.confirmedAt).toBeNull();
      const stockTransaction = await new PgStockTransactionRepository(CONNECTION_STRING, ownerId).getById(stxnId);
      expect(stockTransaction).toMatchObject({
        scripCode: "AAPL",
        quantity: 10,
        pricePerUnitMinor: 15_000,
        trustStatus: "Imported",
        importBatchId: batchId
      });
    } finally {
      await admin`delete from stock_transactions where id = ${stxnId}`;
      await admin`delete from stock_import_batches where id = ${batchId}`;
      await admin`delete from share_trading_accounts where id = ${shareTradingAccount.id}`;
      await admin`delete from institutions where id = ${institution.id}`;
    }
  });

  it("rejects an empty line-item list before any write", async () => {
    const ownerId = randomUUID();
    const { institution, shareTradingAccount } = await seedShareTradingAccount(ownerId);
    const repository = new PgStockImportBatchRepository(CONNECTION_STRING, ownerId);

    try {
      await expect(
        repository.create(
          { id: randomUUID(), shareTradingAccountId: shareTradingAccount.id, source: "x", createdAt: "2026-02-01T00:00:00.000Z" },
          []
        )
      ).rejects.toBeInstanceOf(EmptyStockImportBatchError);
    } finally {
      await admin`delete from share_trading_accounts where id = ${shareTradingAccount.id}`;
      await admin`delete from institutions where id = ${institution.id}`;
    }
  });

  it("rejects a ShareTradingAccount belonging to another Owner, even though the id exists", async () => {
    const ownerA = randomUUID();
    const ownerB = randomUUID();
    const { institution, shareTradingAccount } = await seedShareTradingAccount(ownerB);
    const repoA = new PgStockImportBatchRepository(CONNECTION_STRING, ownerA);

    try {
      await expect(
        repoA.create(
          { id: randomUUID(), shareTradingAccountId: shareTradingAccount.id, source: "x", createdAt: "2026-02-01T00:00:00.000Z" },
          [{ id: randomUUID(), scripCode: "AAPL", type: "Buy", quantity: "10", price: "150.00", occurredAt: "2026-01-15", description: "Buy" }]
        )
      ).rejects.toBeInstanceOf(DatabaseConstraintError);
    } finally {
      await admin`delete from share_trading_accounts where id = ${shareTradingAccount.id}`;
      await admin`delete from institutions where id = ${institution.id}`;
    }
  });

  it("sets possibleDuplicateOfTransactionId on a line item matching an existing StockTransaction's natural key", async () => {
    const ownerId = randomUUID();
    const { institution, shareTradingAccount } = await seedShareTradingAccount(ownerId);
    const stockTransactionRepository = new PgStockTransactionRepository(CONNECTION_STRING, ownerId);
    const existingId = randomUUID();
    await stockTransactionRepository.create({
      id: existingId,
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
    const repository = new PgStockImportBatchRepository(CONNECTION_STRING, ownerId);
    const batchId = randomUUID();
    const newId = randomUUID();

    try {
      await repository.create(
        { id: batchId, shareTradingAccountId: shareTradingAccount.id, source: "x", createdAt: "2026-02-01T00:00:00.000Z" },
        [
          {
            id: newId,
            scripCode: "aapl",
            type: "Buy",
            quantity: "10",
            price: "150.00",
            occurredAt: "2026-01-15",
            description: "Buy AAPL [REF]"
          }
        ]
      );

      const created = await stockTransactionRepository.getById(newId);
      expect(created?.possibleDuplicateOfTransactionId).toBe(existingId);
    } finally {
      await admin`delete from stock_transactions where id in (${existingId}, ${newId})`;
      await admin`delete from stock_import_batches where id = ${batchId}`;
      await admin`delete from share_trading_accounts where id = ${shareTradingAccount.id}`;
      await admin`delete from institutions where id = ${institution.id}`;
    }
  });

  it("prefers a match by externalRef over the natural key, matching even when the date differs", async () => {
    const ownerId = randomUUID();
    const { institution, shareTradingAccount } = await seedShareTradingAccount(ownerId);
    const stockTransactionRepository = new PgStockTransactionRepository(CONNECTION_STRING, ownerId);
    const existingId = randomUUID();
    await stockTransactionRepository.create({
      id: existingId,
      shareTradingAccountId: shareTradingAccount.id,
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
    const repository = new PgStockImportBatchRepository(CONNECTION_STRING, ownerId);
    const batchId = randomUUID();
    const newId = randomUUID();

    try {
      await repository.create(
        { id: batchId, shareTradingAccountId: shareTradingAccount.id, source: "x", createdAt: "2026-02-01T00:00:00.000Z" },
        [
          {
            id: newId,
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

      const created = await stockTransactionRepository.getById(newId);
      expect(created?.possibleDuplicateOfTransactionId).toBe(existingId);
    } finally {
      await admin`delete from stock_transactions where id in (${existingId}, ${newId})`;
      await admin`delete from stock_import_batches where id = ${batchId}`;
      await admin`delete from share_trading_accounts where id = ${shareTradingAccount.id}`;
      await admin`delete from institutions where id = ${institution.id}`;
    }
  });

  it("confirmAll throws StockImportBatchHasUnresolvedDuplicatesError when a batch StockTransaction still carries a Suspected Duplicate flag", async () => {
    const ownerId = randomUUID();
    const { institution, shareTradingAccount } = await seedShareTradingAccount(ownerId);
    const stockTransactionRepository = new PgStockTransactionRepository(CONNECTION_STRING, ownerId);
    await stockTransactionRepository.create({
      id: randomUUID(),
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
    const repository = new PgStockImportBatchRepository(CONNECTION_STRING, ownerId);
    const batchId = randomUUID();
    const newId = randomUUID();

    try {
      await repository.create(
        { id: batchId, shareTradingAccountId: shareTradingAccount.id, source: "x", createdAt: "2026-02-01T00:00:00.000Z" },
        [{ id: newId, scripCode: "AAPL", type: "Buy", quantity: "10", price: "150.00", occurredAt: "2026-01-15", description: "Buy" }]
      );

      await expect(repository.confirmAll(batchId)).rejects.toBeInstanceOf(
        StockImportBatchHasUnresolvedDuplicatesError
      );
      const batch = await repository.getById(batchId);
      expect(batch?.confirmedAt).toBeNull();
    } finally {
      await admin`delete from stock_transactions where share_trading_account_id = ${shareTradingAccount.id}`;
      await admin`delete from stock_import_batches where id = ${batchId}`;
      await admin`delete from share_trading_accounts where id = ${shareTradingAccount.id}`;
      await admin`delete from institutions where id = ${institution.id}`;
    }
  });

  it("confirmAll flips every batch StockTransaction to Confirmed", async () => {
    const ownerId = randomUUID();
    const { institution, shareTradingAccount } = await seedShareTradingAccount(ownerId);
    const repository = new PgStockImportBatchRepository(CONNECTION_STRING, ownerId);
    const batchId = randomUUID();
    const stxnId = randomUUID();

    try {
      await repository.create(
        { id: batchId, shareTradingAccountId: shareTradingAccount.id, source: "x", createdAt: "2026-02-01T00:00:00.000Z" },
        [{ id: stxnId, scripCode: "AAPL", type: "Buy", quantity: "10", price: "150.00", occurredAt: "2026-01-15", description: "Buy" }]
      );

      const confirmed = await repository.confirmAll(batchId);

      expect(confirmed.confirmedAt).not.toBeNull();
      const stockTransaction = await new PgStockTransactionRepository(CONNECTION_STRING, ownerId).getById(stxnId);
      expect(stockTransaction?.trustStatus).toBe("Confirmed");
    } finally {
      await admin`delete from stock_transactions where id = ${stxnId}`;
      await admin`delete from stock_import_batches where id = ${batchId}`;
      await admin`delete from share_trading_accounts where id = ${shareTradingAccount.id}`;
      await admin`delete from institutions where id = ${institution.id}`;
    }
  });

  it("delete on an already-confirmed batch throws without side effects", async () => {
    const ownerId = randomUUID();
    const { institution, shareTradingAccount } = await seedShareTradingAccount(ownerId);
    const repository = new PgStockImportBatchRepository(CONNECTION_STRING, ownerId);
    const batchId = randomUUID();
    const stxnId = randomUUID();

    try {
      await repository.create(
        { id: batchId, shareTradingAccountId: shareTradingAccount.id, source: "x", createdAt: "2026-02-01T00:00:00.000Z" },
        [{ id: stxnId, scripCode: "AAPL", type: "Buy", quantity: "10", price: "150.00", occurredAt: "2026-01-15", description: "Buy" }]
      );
      await repository.confirmAll(batchId);

      await expect(repository.delete(batchId)).rejects.toBeInstanceOf(StockImportBatchAlreadyConfirmedError);
    } finally {
      await admin`delete from stock_transactions where id = ${stxnId}`;
      await admin`delete from stock_import_batches where id = ${batchId}`;
      await admin`delete from share_trading_accounts where id = ${shareTradingAccount.id}`;
      await admin`delete from institutions where id = ${institution.id}`;
    }
  });
});
