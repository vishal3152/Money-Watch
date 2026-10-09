import { randomUUID } from "node:crypto";

import postgres from "postgres";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { resetIdempotencyKeysForTests } from "@/app/duplicate-submission-guard";
import {
  createStockTransaction,
  type StockTransactionFormState
} from "@/app/share-trading-accounts/[id]/stock-transactions/new/actions";
import { PgInstitutionRepository } from "@/db/postgres/repositories/institution-repository";
import { PgShareTradingAccountRepository } from "@/db/postgres/repositories/share-trading-account-repository";
import { PgStockTransactionRepository } from "@/db/postgres/repositories/stock-transaction-repository";
import { InstitutionRepository } from "@/db/repositories/institution-repository";
import { ShareTradingAccountRepository } from "@/db/repositories/share-trading-account-repository";
import { StockTransactionRepository } from "@/db/repositories/stock-transaction-repository";
import { createTestDb } from "@/db/repositories/test-db";

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

function stockTransactionFormData(
  overrides: Partial<
    Record<"shareTradingAccountId" | "scripCode" | "type" | "quantity" | "price" | "occurredAt" | "description", string>
  > = {}
) {
  const formData = new FormData();
  formData.set("shareTradingAccountId", overrides.shareTradingAccountId ?? "sta-1");
  formData.set("scripCode", overrides.scripCode ?? "aapl");
  formData.set("type", overrides.type ?? "Buy");
  formData.set("quantity", overrides.quantity ?? "10");
  formData.set("price", overrides.price ?? "150.00");
  formData.set("occurredAt", overrides.occurredAt ?? "2026-01-01T09:30");
  formData.set("description", overrides.description ?? "Initial buy");
  return formData;
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

describe("createStockTransaction", () => {
  beforeEach(() => {
    resetIdempotencyKeysForTests();
  });

  it("rejects a non-positive quantity before any repository call", async () => {
    const testDb = createTestDb();
    await seedShareTradingAccount(testDb.db);
    const stockTransactions = new StockTransactionRepository(testDb.db);
    const redirectTo = vi.fn();

    const result = await createStockTransaction(
      {} as StockTransactionFormState,
      stockTransactionFormData({ quantity: "0" }),
      { db: testDb.db, redirectTo, newId: () => "stxn-should-not-exist" }
    );

    expect(result).toMatchObject({
      fieldErrors: { quantity: { key: "errors.quantityInvalid" } }
    });
    expect(await stockTransactions.listByShareTradingAccountId("sta-1")).toEqual([]);
    expect(redirectTo).not.toHaveBeenCalled();
  });

  it("rejects a fractional quantity", async () => {
    const testDb = createTestDb();
    await seedShareTradingAccount(testDb.db);

    const result = await createStockTransaction(
      {} as StockTransactionFormState,
      stockTransactionFormData({ quantity: "10.5" }),
      { db: testDb.db, redirectTo: vi.fn(), newId: () => "stxn-should-not-exist" }
    );

    expect(result.fieldErrors?.quantity).toEqual({ key: "errors.quantityInvalid" });
  });

  it("rejects a negative price", async () => {
    const testDb = createTestDb();
    await seedShareTradingAccount(testDb.db);

    const result = await createStockTransaction(
      {} as StockTransactionFormState,
      stockTransactionFormData({ price: "-1.00" }),
      { db: testDb.db, redirectTo: vi.fn(), newId: () => "stxn-should-not-exist" }
    );

    expect(result.fieldErrors?.price).toEqual({ key: "errors.priceInvalid" });
  });

  it("surfaces an unknown ShareTradingAccount as a banner error without persisting", async () => {
    const testDb = createTestDb();
    const redirectTo = vi.fn();

    const result = await createStockTransaction(
      {} as StockTransactionFormState,
      stockTransactionFormData({ shareTradingAccountId: "missing" }),
      { db: testDb.db, redirectTo, newId: () => "stxn-should-not-exist" }
    );

    expect(result).toMatchObject({ formError: { key: "errors.shareTradingAccountMissing" } });
    expect(redirectTo).not.toHaveBeenCalled();
  });

  it("normalizes scripCode to uppercase and persists a valid Buy, retrievable through the ledger", async () => {
    const testDb = createTestDb();
    await seedShareTradingAccount(testDb.db);
    const stockTransactions = new StockTransactionRepository(testDb.db);
    const redirectTo = vi.fn();

    const result = await createStockTransaction(
      {} as StockTransactionFormState,
      stockTransactionFormData({ scripCode: " aapl " }),
      { db: testDb.db, redirectTo, newId: () => "stxn-1" }
    );

    expect(result).toEqual({});
    expect(await stockTransactions.getById("stxn-1")).toEqual({
      id: "stxn-1",
      shareTradingAccountId: "sta-1",
      scripCode: "AAPL",
      type: "Buy",
      quantity: 10,
      pricePerUnitMinor: 15_000,
      occurredAt: new Date("2026-01-01T09:30").toISOString(),
      description: "Initial buy",
      trustStatus: "Confirmed",
      importBatchId: null,
      externalRef: null,
      possibleDuplicateOfTransactionId: null
    });
    expect(redirectTo).toHaveBeenCalledWith("/share-trading-accounts/sta-1?message=stock_transaction_created");
  });

  it("rejects a Sell quantity greater than the current holding, without persisting", async () => {
    const testDb = createTestDb();
    await seedShareTradingAccount(testDb.db);
    const stockTransactions = new StockTransactionRepository(testDb.db);
    await stockTransactions.create({
      id: "stxn-buy",
      shareTradingAccountId: "sta-1",
      scripCode: "AAPL",
      type: "Buy",
      quantity: 10,
      pricePerUnitMinor: 15_000,
      occurredAt: "2026-01-01T09:30:00.000Z",
      description: "Initial buy",
      trustStatus: "Confirmed",
      importBatchId: null
    });
    const redirectTo = vi.fn();

    const result = await createStockTransaction(
      {} as StockTransactionFormState,
      stockTransactionFormData({ scripCode: "AAPL", type: "Sell", quantity: "20" }),
      { db: testDb.db, redirectTo, newId: () => "stxn-oversell" }
    );

    expect(result.fieldErrors?.quantity).toEqual({
      key: "errors.databaseDetail",
      params: { detail: "Only 10 share(s) of AAPL are held; cannot sell 20." }
    });
    expect(await stockTransactions.getById("stxn-oversell")).toBeNull();
    expect(redirectTo).not.toHaveBeenCalled();
  });

  it("accepts a Sell quantity equal to the current holding", async () => {
    const testDb = createTestDb();
    await seedShareTradingAccount(testDb.db);
    const stockTransactions = new StockTransactionRepository(testDb.db);
    await stockTransactions.create({
      id: "stxn-buy",
      shareTradingAccountId: "sta-1",
      scripCode: "AAPL",
      type: "Buy",
      quantity: 10,
      pricePerUnitMinor: 15_000,
      occurredAt: "2026-01-01T09:30:00.000Z",
      description: "Initial buy",
      trustStatus: "Confirmed",
      importBatchId: null
    });

    const result = await createStockTransaction(
      {} as StockTransactionFormState,
      stockTransactionFormData({ scripCode: "AAPL", type: "Sell", quantity: "10" }),
      { db: testDb.db, redirectTo: vi.fn(), newId: () => "stxn-sell" }
    );

    expect(result).toEqual({});
    expect(await stockTransactions.getById("stxn-sell")).not.toBeNull();
  });

  it("rejects a second submission carrying the same idempotencyKey as a likely duplicate", async () => {
    const testDb = createTestDb();
    await seedShareTradingAccount(testDb.db);
    const stockTransactions = new StockTransactionRepository(testDb.db);

    const first = stockTransactionFormData();
    first.set("idempotencyKey", "same-key");
    const firstResult = await createStockTransaction({} as StockTransactionFormState, first, {
      db: testDb.db,
      redirectTo: vi.fn(),
      newId: () => "stxn-first"
    });
    expect(firstResult).toEqual({});

    const second = stockTransactionFormData();
    second.set("idempotencyKey", "same-key");
    const redirectTo = vi.fn();
    const secondResult = await createStockTransaction({} as StockTransactionFormState, second, {
      db: testDb.db,
      redirectTo,
      newId: () => "stxn-second"
    });

    expect(secondResult.formError).toEqual({ key: "errors.duplicateSubmission" });
    expect(redirectTo).not.toHaveBeenCalled();
    expect(await stockTransactions.listByShareTradingAccountId("sta-1")).toHaveLength(1);
  });

  it("persists to the Postgres repository, scoped to the owner, when an owner is resolved", async () => {
    const ownerId = randomUUID();
    const institution = { id: randomUUID(), name: "Cloud Broker" };
    await new PgInstitutionRepository(TEST_DATABASE_URL, ownerId).create(institution);
    const shareTradingAccount = {
      id: randomUUID(),
      institutionId: institution.id,
      name: "Cloud US Equities",
      accountNumber: null,
      currencyCode: "USD"
    };
    await new PgShareTradingAccountRepository(TEST_DATABASE_URL, ownerId).create(shareTradingAccount);
    const id = randomUUID();
    const redirectTo = vi.fn();

    try {
      const result = await createStockTransaction(
        {} as StockTransactionFormState,
        stockTransactionFormData({ shareTradingAccountId: shareTradingAccount.id }),
        {
          getCurrentOwnerId: async () => ownerId,
          isCloudMode: () => true,
          postgresConnectionString: TEST_DATABASE_URL,
          redirectTo,
          newId: () => id
        }
      );

      expect(result).toEqual({});
      const pgStockTransactions = new PgStockTransactionRepository(TEST_DATABASE_URL, ownerId);
      expect(await pgStockTransactions.getById(id)).toMatchObject({
        id,
        shareTradingAccountId: shareTradingAccount.id,
        scripCode: "AAPL",
        type: "Buy",
        quantity: 10,
        pricePerUnitMinor: 15_000
      });
      expect(redirectTo).toHaveBeenCalledWith(`/share-trading-accounts/${shareTradingAccount.id}?message=stock_transaction_created`);
    } finally {
      const admin = postgres(TEST_DATABASE_URL, { max: 1 });
      await admin`delete from stock_transactions where id = ${id}`;
      await admin`delete from share_trading_accounts where id = ${shareTradingAccount.id}`;
      await admin`delete from institutions where id = ${institution.id}`;
      await admin.end();
    }
  });
});
