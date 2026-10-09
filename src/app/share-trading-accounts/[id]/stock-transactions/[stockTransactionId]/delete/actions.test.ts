import { randomUUID } from "node:crypto";

import postgres from "postgres";
import { describe, expect, it, vi } from "vitest";

import { deleteStockTransaction } from "@/app/share-trading-accounts/[id]/stock-transactions/[stockTransactionId]/delete/actions";
import { PgInstitutionRepository } from "@/db/postgres/repositories/institution-repository";
import { PgShareTradingAccountRepository } from "@/db/postgres/repositories/share-trading-account-repository";
import { PgStockTransactionRepository } from "@/db/postgres/repositories/stock-transaction-repository";
import { InstitutionRepository } from "@/db/repositories/institution-repository";
import { ShareTradingAccountRepository } from "@/db/repositories/share-trading-account-repository";
import { StockTransactionRepository } from "@/db/repositories/stock-transaction-repository";
import { createTestDb } from "@/db/repositories/test-db";

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

function formData(stockTransactionId: string, shareTradingAccountId: string): FormData {
  const data = new FormData();
  data.set("stockTransactionId", stockTransactionId);
  data.set("shareTradingAccountId", shareTradingAccountId);
  return data;
}

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

describe("deleteStockTransaction", () => {
  it("deletes a StockTransaction and redirects to the ShareTradingAccount", async () => {
    const testDb = createTestDb();
    await seedShareTradingAccount(testDb.db);
    const stockTransactions = new StockTransactionRepository(testDb.db);
    await stockTransactions.create({
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
    const redirectTo = vi.fn();

    const result = await deleteStockTransaction({}, formData("stxn-1", "sta-1"), {
      db: testDb.db,
      redirectTo
    });

    expect(result).toEqual({});
    expect(await stockTransactions.getById("stxn-1")).toBeNull();
    expect(redirectTo).toHaveBeenCalledWith("/share-trading-accounts/sta-1?message=stock_transaction_deleted");
  });

  it("returns a form error and does not delete when shareTradingAccountId does not match the actual account", async () => {
    const testDb = createTestDb();
    await seedShareTradingAccount(testDb.db);
    await new ShareTradingAccountRepository(testDb.db).create({
      id: "sta-2",
      institutionId: "inst-1",
      name: "Other Equities",
      accountNumber: null,
      currencyCode: "USD"
    });
    const stockTransactions = new StockTransactionRepository(testDb.db);
    await stockTransactions.create({
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
    const redirectTo = vi.fn();

    const result = await deleteStockTransaction({}, formData("stxn-1", "sta-2"), {
      db: testDb.db,
      redirectTo
    });

    expect(result.formError).toBeTruthy();
    expect(await stockTransactions.getById("stxn-1")).not.toBeNull();
    expect(redirectTo).not.toHaveBeenCalled();
  });

  it("persists to the Postgres repository, scoped to the owner, when an owner is resolved", async () => {
    const ownerId = randomUUID();
    const institution = { id: randomUUID(), name: "Cloud Broker" };
    const shareTradingAccount = {
      id: randomUUID(),
      institutionId: institution.id,
      name: "Cloud US Equities",
      accountNumber: null,
      currencyCode: "USD"
    };
    await new PgInstitutionRepository(TEST_DATABASE_URL, ownerId).create(institution);
    await new PgShareTradingAccountRepository(TEST_DATABASE_URL, ownerId).create(shareTradingAccount);
    const pgStockTransactions = new PgStockTransactionRepository(TEST_DATABASE_URL, ownerId);
    const stockTransactionId = randomUUID();
    await pgStockTransactions.create({
      id: stockTransactionId,
      shareTradingAccountId: shareTradingAccount.id,
      scripCode: "AAPL",
      type: "Buy",
      quantity: 10,
      pricePerUnitMinor: 15_000,
      occurredAt: "2026-01-01T10:00:00.000Z",
      description: "Buy AAPL",
      trustStatus: "Confirmed",
      importBatchId: null
    });
    const redirectTo = vi.fn();

    try {
      const result = await deleteStockTransaction(
        {},
        formData(stockTransactionId, shareTradingAccount.id),
        {
          getCurrentOwnerId: async () => ownerId,
          isCloudMode: () => true,
          postgresConnectionString: TEST_DATABASE_URL,
          redirectTo
        }
      );

      expect(result).toEqual({});
      expect(await pgStockTransactions.getById(stockTransactionId)).toBeNull();
      expect(redirectTo).toHaveBeenCalledWith(`/share-trading-accounts/${shareTradingAccount.id}?message=stock_transaction_deleted`);
    } finally {
      const admin = postgres(TEST_DATABASE_URL, { max: 1 });
      await admin`delete from stock_transactions where id = ${stockTransactionId}`;
      await admin`delete from share_trading_accounts where id = ${shareTradingAccount.id}`;
      await admin`delete from institutions where id = ${institution.id}`;
      await admin.end();
    }
  });
});
