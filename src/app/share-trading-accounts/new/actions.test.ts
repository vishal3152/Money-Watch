import { randomUUID } from "node:crypto";

import postgres from "postgres";
import { describe, expect, it, vi } from "vitest";

import { createShareTradingAccount, type ShareTradingAccountFormState } from "@/app/share-trading-accounts/new/actions";
import { PgInstitutionRepository } from "@/db/postgres/repositories/institution-repository";
import { PgShareTradingAccountRepository } from "@/db/postgres/repositories/share-trading-account-repository";
import { InstitutionRepository } from "@/db/repositories/institution-repository";
import { ShareTradingAccountRepository } from "@/db/repositories/share-trading-account-repository";
import { createTestDb } from "@/db/repositories/test-db";

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

function shareTradingAccountFormData(
  overrides: Partial<Record<"institutionId" | "name" | "accountNumber" | "currencyCode", string>> = {}
) {
  const formData = new FormData();
  formData.set("institutionId", overrides.institutionId ?? "inst-1");
  formData.set("name", overrides.name ?? "US Equities");
  if (overrides.accountNumber !== undefined) {
    formData.set("accountNumber", overrides.accountNumber);
  }
  formData.set("currencyCode", overrides.currencyCode ?? "USD");
  return formData;
}

describe("createShareTradingAccount", () => {
  it("rejects a malformed currency code before any repository call", async () => {
    const testDb = createTestDb();
    const shareTradingAccounts = new ShareTradingAccountRepository(testDb.db);
    const redirectTo = vi.fn();

    const result = await createShareTradingAccount(
      {} as ShareTradingAccountFormState,
      shareTradingAccountFormData({ currencyCode: "usd" }),
      { db: testDb.db, redirectTo, newId: () => "sta-should-not-exist" }
    );

    expect(result).toMatchObject({
      fieldErrors: { currencyCode: { key: "errors.currencyCodeInvalid" } }
    });
    expect(result.formKey).toBeTruthy();
    expect(await shareTradingAccounts.listAll()).toEqual([]);
    expect(redirectTo).not.toHaveBeenCalled();
  });

  it("surfaces an unknown Institution as a banner error without persisting", async () => {
    const testDb = createTestDb();
    const shareTradingAccounts = new ShareTradingAccountRepository(testDb.db);
    const redirectTo = vi.fn();

    const result = await createShareTradingAccount(
      {} as ShareTradingAccountFormState,
      shareTradingAccountFormData({ institutionId: "missing" }),
      { db: testDb.db, redirectTo, newId: () => "sta-should-not-exist" }
    );

    expect(result).toMatchObject({ formError: { key: "errors.institutionMissing" } });
    expect(await shareTradingAccounts.listAll()).toEqual([]);
    expect(redirectTo).not.toHaveBeenCalled();
  });

  it("persists a valid ShareTradingAccount retrievable directly and through its Institution list", async () => {
    const testDb = createTestDb();
    const institutions = new InstitutionRepository(testDb.db);
    const shareTradingAccounts = new ShareTradingAccountRepository(testDb.db);
    const redirectTo = vi.fn();
    await institutions.create({ id: "inst-1", name: "Broker One" });

    const result = await createShareTradingAccount(
      {} as ShareTradingAccountFormState,
      shareTradingAccountFormData(),
      { db: testDb.db, redirectTo, newId: () => "sta-1" }
    );

    const shareTradingAccount = {
      id: "sta-1",
      institutionId: "inst-1",
      name: "US Equities",
      accountNumber: null,
      currencyCode: "USD"
    };
    expect(result).toEqual({});
    expect(await shareTradingAccounts.getById("sta-1")).toEqual(shareTradingAccount);
    expect(redirectTo).toHaveBeenCalledWith("/share-trading-accounts/sta-1?message=share_trading_account_created");
  });

  it("persists to the Postgres repository, scoped to the owner, when an owner is resolved", async () => {
    const ownerId = randomUUID();
    const institution = { id: randomUUID(), name: "Cloud Broker" };
    await new PgInstitutionRepository(TEST_DATABASE_URL, ownerId).create(institution);
    const id = randomUUID();
    const redirectTo = vi.fn();

    try {
      const result = await createShareTradingAccount(
        {} as ShareTradingAccountFormState,
        shareTradingAccountFormData({ institutionId: institution.id }),
        {
          getCurrentOwnerId: async () => ownerId,
          isCloudMode: () => true,
          postgresConnectionString: TEST_DATABASE_URL,
          redirectTo,
          newId: () => id
        }
      );

      expect(result).toEqual({});
      const pgShareTradingAccounts = new PgShareTradingAccountRepository(TEST_DATABASE_URL, ownerId);
      expect(await pgShareTradingAccounts.getById(id)).toEqual({
        id,
        institutionId: institution.id,
        name: "US Equities",
        accountNumber: null,
        currencyCode: "USD"
      });
      expect(redirectTo).toHaveBeenCalledWith(`/share-trading-accounts/${id}?message=share_trading_account_created`);
    } finally {
      const admin = postgres(TEST_DATABASE_URL, { max: 1 });
      await admin`delete from share_trading_accounts where id = ${id}`;
      await admin`delete from institutions where id = ${institution.id}`;
      await admin.end();
    }
  });
});
