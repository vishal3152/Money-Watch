import { randomUUID } from "node:crypto";

import postgres from "postgres";
import { describe, expect, it, vi } from "vitest";

import {
  updateStockTransaction,
  type StockTransactionEditFormState
} from "@/app/share-trading-accounts/[id]/stock-transactions/[stockTransactionId]/edit/actions";
import { PgInstitutionRepository } from "@/db/postgres/repositories/institution-repository";
import { PgShareTradingAccountRepository } from "@/db/postgres/repositories/share-trading-account-repository";
import { PgStockTransactionRepository } from "@/db/postgres/repositories/stock-transaction-repository";
import { InstitutionRepository } from "@/db/repositories/institution-repository";
import { ShareTradingAccountRepository } from "@/db/repositories/share-trading-account-repository";
import { StockTransactionRepository } from "@/db/repositories/stock-transaction-repository";
import { createTestDb } from "@/db/repositories/test-db";

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

function editFormData(
  overrides: Partial<
    Record<
      "stockTransactionId" | "shareTradingAccountId" | "scripCode" | "type" | "quantity" | "price" | "occurredAt" | "description",
      string
    >
  > = {}
): FormData {
  const formData = new FormData();
  formData.set("stockTransactionId", overrides.stockTransactionId ?? "stxn-1");
  formData.set("shareTradingAccountId", overrides.shareTradingAccountId ?? "sta-1");
  formData.set("scripCode", overrides.scripCode ?? "aapl");
  formData.set("type", overrides.type ?? "Buy");
  formData.set("quantity", overrides.quantity ?? "20");
  formData.set("price", overrides.price ?? "160.00");
  formData.set("occurredAt", overrides.occurredAt ?? "2026-01-02T09:30");
  formData.set("description", overrides.description ?? "Corrected entry");
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

async function seedStockTransaction(db: ReturnType<typeof createTestDb>["db"]) {
  await seedShareTradingAccount(db);
  await new StockTransactionRepository(db).create({
    id: "stxn-1",
    shareTradingAccountId: "sta-1",
    scripCode: "AAPL",
    type: "Buy",
    quantity: 10,
    pricePerUnitMinor: 15_000,
    occurredAt: "2026-01-01T10:00:00.000Z",
    description: "Original buy",
    trustStatus: "Confirmed",
    importBatchId: null
  });
}

describe("updateStockTransaction", () => {
  it("rejects a non-positive quantity without persisting", async () => {
    const testDb = createTestDb();
    await seedStockTransaction(testDb.db);
    const stockTransactions = new StockTransactionRepository(testDb.db);
    const redirectTo = vi.fn();

    const result = await updateStockTransaction(
      {} as StockTransactionEditFormState,
      editFormData({ quantity: "0" }),
      { db: testDb.db, redirectTo }
    );

    expect(result.fieldErrors?.quantity).toEqual({ key: "errors.quantityInvalid" });
    expect((await stockTransactions.getById("stxn-1"))?.quantity).toBe(10);
    expect(redirectTo).not.toHaveBeenCalled();
  });

  it("rejects a negative price without persisting", async () => {
    const testDb = createTestDb();
    await seedStockTransaction(testDb.db);
    const stockTransactions = new StockTransactionRepository(testDb.db);
    const redirectTo = vi.fn();

    const result = await updateStockTransaction(
      {} as StockTransactionEditFormState,
      editFormData({ price: "-1.00" }),
      { db: testDb.db, redirectTo }
    );

    expect(result.fieldErrors?.price).toEqual({ key: "errors.priceInvalid" });
    expect((await stockTransactions.getById("stxn-1"))?.pricePerUnitMinor).toBe(15_000);
    expect(redirectTo).not.toHaveBeenCalled();
  });

  it("rejects an empty description without persisting", async () => {
    const testDb = createTestDb();
    await seedStockTransaction(testDb.db);
    const stockTransactions = new StockTransactionRepository(testDb.db);
    const formData = editFormData();
    formData.set("description", "   ");
    const redirectTo = vi.fn();

    const result = await updateStockTransaction({} as StockTransactionEditFormState, formData, {
      db: testDb.db,
      redirectTo
    });

    expect(result.fieldErrors?.description).toEqual({ key: "errors.descriptionRequired" });
    expect((await stockTransactions.getById("stxn-1"))?.description).toBe("Original buy");
    expect(redirectTo).not.toHaveBeenCalled();
  });

  it("returns a form error and does not change the StockTransaction when shareTradingAccountId does not match its actual account", async () => {
    const testDb = createTestDb();
    await seedStockTransaction(testDb.db);
    await new ShareTradingAccountRepository(testDb.db).create({
      id: "sta-2",
      institutionId: "inst-1",
      name: "Other Equities",
      accountNumber: null,
      currencyCode: "USD"
    });
    const stockTransactions = new StockTransactionRepository(testDb.db);
    const redirectTo = vi.fn();

    const result = await updateStockTransaction(
      {} as StockTransactionEditFormState,
      editFormData({ shareTradingAccountId: "sta-2" }),
      { db: testDb.db, redirectTo }
    );

    expect(result.formError).toBeTruthy();
    expect((await stockTransactions.getById("stxn-1"))?.description).toBe("Original buy");
    expect(redirectTo).not.toHaveBeenCalled();
  });

  it("updates a StockTransaction and redirects to the ShareTradingAccount", async () => {
    const testDb = createTestDb();
    await seedStockTransaction(testDb.db);
    const stockTransactions = new StockTransactionRepository(testDb.db);
    // A separate MSFT holding so editing stxn-1 into a 5-share MSFT Sell below
    // doesn't trip the "can't sell more than is held" guard.
    await stockTransactions.create({
      id: "stxn-msft-buy",
      shareTradingAccountId: "sta-1",
      scripCode: "MSFT",
      type: "Buy",
      quantity: 10,
      pricePerUnitMinor: 30_000,
      occurredAt: "2026-01-01T09:00:00.000Z",
      description: "MSFT buy",
      trustStatus: "Confirmed",
      importBatchId: null
    });
    const redirectTo = vi.fn();

    const result = await updateStockTransaction(
      {} as StockTransactionEditFormState,
      editFormData({ scripCode: " msft ", type: "Sell", quantity: "5", price: "300.50" }),
      { db: testDb.db, redirectTo }
    );

    expect(result).toEqual({});
    expect(await stockTransactions.getById("stxn-1")).toEqual({
      id: "stxn-1",
      shareTradingAccountId: "sta-1",
      scripCode: "MSFT",
      type: "Sell",
      quantity: 5,
      pricePerUnitMinor: 30_050,
      occurredAt: new Date("2026-01-02T09:30").toISOString(),
      description: "Corrected entry",
      trustStatus: "Confirmed",
      importBatchId: null,
      externalRef: null,
      possibleDuplicateOfTransactionId: null
    });
    expect(redirectTo).toHaveBeenCalledWith("/share-trading-accounts/sta-1?message=stock_transaction_updated");
  });

  it("leaves trustStatus and importBatchId of an Imported StockTransaction untouched", async () => {
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
      description: "Original buy",
      trustStatus: "Imported",
      importBatchId: null
    });
    const redirectTo = vi.fn();

    const result = await updateStockTransaction({} as StockTransactionEditFormState, editFormData(), {
      db: testDb.db,
      redirectTo
    });

    expect(result).toEqual({});
    const updated = await stockTransactions.getById("stxn-1");
    expect(updated?.trustStatus).toBe("Imported");
    expect(updated?.importBatchId).toBeNull();
  });

  it("rejects editing a StockTransaction into a Sell that exceeds the (other) current holding", async () => {
    const testDb = createTestDb();
    await seedStockTransaction(testDb.db);
    const stockTransactions = new StockTransactionRepository(testDb.db);
    const redirectTo = vi.fn();

    // stxn-1 (a 10-share AAPL Buy) is the only AAPL transaction, so excluding
    // it while computing the holding leaves 0 AAPL available to sell.
    const result = await updateStockTransaction(
      {} as StockTransactionEditFormState,
      editFormData({ scripCode: "AAPL", type: "Sell", quantity: "5" }),
      { db: testDb.db, redirectTo }
    );

    expect(result.fieldErrors?.quantity).toEqual({
      key: "errors.databaseDetail",
      params: { detail: "Only 0 share(s) of AAPL are held; cannot sell 5." }
    });
    expect(redirectTo).not.toHaveBeenCalled();
    expect((await stockTransactions.getById("stxn-1"))?.type).toBe("Buy");
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
      description: "Original buy",
      trustStatus: "Confirmed",
      importBatchId: null
    });
    const redirectTo = vi.fn();

    try {
      const result = await updateStockTransaction(
        {} as StockTransactionEditFormState,
        editFormData({ stockTransactionId, shareTradingAccountId: shareTradingAccount.id }),
        {
          getCurrentOwnerId: async () => ownerId,
          isCloudMode: () => true,
          postgresConnectionString: TEST_DATABASE_URL,
          redirectTo
        }
      );

      expect(result).toEqual({});
      expect(await pgStockTransactions.getById(stockTransactionId)).toMatchObject({
        scripCode: "AAPL",
        quantity: 20,
        pricePerUnitMinor: 16_000,
        description: "Corrected entry"
      });
      expect(redirectTo).toHaveBeenCalledWith(`/share-trading-accounts/${shareTradingAccount.id}?message=stock_transaction_updated`);
    } finally {
      const admin = postgres(TEST_DATABASE_URL, { max: 1 });
      await admin`delete from stock_transactions where id = ${stockTransactionId}`;
      await admin`delete from share_trading_accounts where id = ${shareTradingAccount.id}`;
      await admin`delete from institutions where id = ${institution.id}`;
      await admin.end();
    }
  });
});
