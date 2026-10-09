import { randomUUID } from "node:crypto";

import postgres from "postgres";
import { describe, expect, it, vi } from "vitest";

import { deleteShareTradingAccount } from "@/app/share-trading-accounts/[id]/delete-actions";
import { PgInstitutionRepository } from "@/db/postgres/repositories/institution-repository";
import { PgShareTradingAccountRepository } from "@/db/postgres/repositories/share-trading-account-repository";
import { InstitutionRepository } from "@/db/repositories/institution-repository";
import { ShareTradingAccountRepository } from "@/db/repositories/share-trading-account-repository";
import { StockTransactionRepository } from "@/db/repositories/stock-transaction-repository";
import { createTestDb } from "@/db/repositories/test-db";

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

function formData(shareTradingAccountId: string, institutionId: string): FormData {
  const data = new FormData();
  data.set("shareTradingAccountId", shareTradingAccountId);
  data.set("institutionId", institutionId);
  return data;
}

describe("deleteShareTradingAccount", () => {
  it("deletes a childless ShareTradingAccount and redirects to its Institution", async () => {
    const testDb = createTestDb();
    await new InstitutionRepository(testDb.db).create({ id: "inst-1", name: "Broker One" });
    const shareTradingAccounts = new ShareTradingAccountRepository(testDb.db);
    await shareTradingAccounts.create({
      id: "sta-1",
      institutionId: "inst-1",
      name: "US Equities",
      accountNumber: null,
      currencyCode: "USD"
    });
    const redirectTo = vi.fn();

    const result = await deleteShareTradingAccount({}, formData("sta-1", "inst-1"), {
      db: testDb.db,
      redirectTo
    });

    expect(result).toEqual({});
    expect(await shareTradingAccounts.getById("sta-1")).toBeNull();
    expect(redirectTo).toHaveBeenCalledWith(
      "/institutions/inst-1?message=share_trading_account_deleted"
    );
  });

  it("returns a form error and does not delete when the ShareTradingAccount still has StockTransactions", async () => {
    const testDb = createTestDb();
    await new InstitutionRepository(testDb.db).create({ id: "inst-1", name: "Broker One" });
    const shareTradingAccounts = new ShareTradingAccountRepository(testDb.db);
    await shareTradingAccounts.create({
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
    const redirectTo = vi.fn();

    const result = await deleteShareTradingAccount({}, formData("sta-1", "inst-1"), {
      db: testDb.db,
      redirectTo
    });

    expect(result.formError).toBeDefined();
    expect(await shareTradingAccounts.getById("sta-1")).not.toBeNull();
    expect(redirectTo).not.toHaveBeenCalled();
  });

  it("deletes from the Postgres repository, scoped to the owner, when an owner is resolved", async () => {
    const ownerId = randomUUID();
    const institution = { id: randomUUID(), name: "Cloud Broker" };
    const shareTradingAccount = {
      id: randomUUID(),
      institutionId: institution.id,
      name: "US Equities",
      accountNumber: null,
      currencyCode: "USD"
    };
    await new PgInstitutionRepository(TEST_DATABASE_URL, ownerId).create(institution);
    const pgShareTradingAccounts = new PgShareTradingAccountRepository(TEST_DATABASE_URL, ownerId);
    await pgShareTradingAccounts.create(shareTradingAccount);
    const redirectTo = vi.fn();

    try {
      const result = await deleteShareTradingAccount(
        {},
        formData(shareTradingAccount.id, institution.id),
        {
          getCurrentOwnerId: async () => ownerId,
          isCloudMode: () => true,
          postgresConnectionString: TEST_DATABASE_URL,
          redirectTo
        }
      );

      expect(result).toEqual({});
      expect(await pgShareTradingAccounts.getById(shareTradingAccount.id)).toBeNull();
      expect(redirectTo).toHaveBeenCalledWith(
        `/institutions/${institution.id}?message=share_trading_account_deleted`
      );
    } finally {
      const admin = postgres(TEST_DATABASE_URL, { max: 1 });
      await admin`delete from share_trading_accounts where id = ${shareTradingAccount.id}`;
      await admin`delete from institutions where id = ${institution.id}`;
      await admin.end();
    }
  });
});
