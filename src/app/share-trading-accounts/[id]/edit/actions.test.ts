import { randomUUID } from "node:crypto";

import postgres from "postgres";
import { describe, expect, it, vi } from "vitest";

import {
  updateShareTradingAccount,
  type EditShareTradingAccountFormState
} from "@/app/share-trading-accounts/[id]/edit/actions";
import { PgInstitutionRepository } from "@/db/postgres/repositories/institution-repository";
import { PgShareTradingAccountRepository } from "@/db/postgres/repositories/share-trading-account-repository";
import { InstitutionRepository } from "@/db/repositories/institution-repository";
import { ShareTradingAccountRepository } from "@/db/repositories/share-trading-account-repository";
import { createTestDb } from "@/db/repositories/test-db";

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

function editFormData(
  shareTradingAccountId: string,
  overrides: Partial<Record<"name" | "accountNumber", string>> = {}
): FormData {
  const formData = new FormData();
  formData.set("shareTradingAccountId", shareTradingAccountId);
  formData.set("name", overrides.name ?? "US Equities");
  if (overrides.accountNumber !== undefined) {
    formData.set("accountNumber", overrides.accountNumber);
  }
  return formData;
}

describe("updateShareTradingAccount", () => {
  it("rejects an empty name without persisting", async () => {
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

    const result = await updateShareTradingAccount(
      {} as EditShareTradingAccountFormState,
      editFormData("sta-1", { name: "  " }),
      { db: testDb.db, redirectTo }
    );

    expect(result.fieldErrors?.name).toEqual({ key: "errors.accountNameRequired" });
    expect(await shareTradingAccounts.getById("sta-1")).toMatchObject({ name: "US Equities" });
    expect(redirectTo).not.toHaveBeenCalled();
  });

  it("updates a ShareTradingAccount's name and account number, and redirects to its detail page", async () => {
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

    const result = await updateShareTradingAccount(
      {} as EditShareTradingAccountFormState,
      editFormData("sta-1", { name: "US Equities (Renamed)", accountNumber: "DEMAT999" }),
      { db: testDb.db, redirectTo }
    );

    expect(result).toEqual({});
    expect(await shareTradingAccounts.getById("sta-1")).toEqual({
      id: "sta-1",
      institutionId: "inst-1",
      name: "US Equities (Renamed)",
      accountNumber: "DEMAT999",
      currencyCode: "USD"
    });
    expect(redirectTo).toHaveBeenCalledWith(
      "/share-trading-accounts/sta-1?message=share_trading_account_updated"
    );
  });

  it("clears an account number when submitted blank", async () => {
    const testDb = createTestDb();
    await new InstitutionRepository(testDb.db).create({ id: "inst-1", name: "Broker One" });
    const shareTradingAccounts = new ShareTradingAccountRepository(testDb.db);
    await shareTradingAccounts.create({
      id: "sta-1",
      institutionId: "inst-1",
      name: "US Equities",
      accountNumber: "999",
      currencyCode: "USD"
    });

    const result = await updateShareTradingAccount(
      {} as EditShareTradingAccountFormState,
      editFormData("sta-1", { accountNumber: "" }),
      { db: testDb.db, redirectTo: vi.fn() }
    );

    expect(result).toEqual({});
    expect(await shareTradingAccounts.getById("sta-1")).toMatchObject({ accountNumber: null });
  });

  it("updates the Postgres repository, scoped to the owner, when an owner is resolved", async () => {
    const ownerId = randomUUID();
    const institution = { id: randomUUID(), name: "Cloud Broker" };
    await new PgInstitutionRepository(TEST_DATABASE_URL, ownerId).create(institution);
    const id = randomUUID();
    const pgShareTradingAccounts = new PgShareTradingAccountRepository(TEST_DATABASE_URL, ownerId);
    await pgShareTradingAccounts.create({
      id,
      institutionId: institution.id,
      name: "US Equities",
      accountNumber: null,
      currencyCode: "USD"
    });
    const redirectTo = vi.fn();

    try {
      const result = await updateShareTradingAccount(
        {} as EditShareTradingAccountFormState,
        editFormData(id, { name: "Renamed Equities" }),
        {
          getCurrentOwnerId: async () => ownerId,
          isCloudMode: () => true,
          postgresConnectionString: TEST_DATABASE_URL,
          redirectTo
        }
      );

      expect(result).toEqual({});
      expect(await pgShareTradingAccounts.getById(id)).toMatchObject({ name: "Renamed Equities" });
      expect(redirectTo).toHaveBeenCalledWith(
        `/share-trading-accounts/${id}?message=share_trading_account_updated`
      );
    } finally {
      const admin = postgres(TEST_DATABASE_URL, { max: 1 });
      await admin`delete from share_trading_accounts where id = ${id}`;
      await admin`delete from institutions where id = ${institution.id}`;
      await admin.end();
    }
  });
});
