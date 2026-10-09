import { randomUUID } from "node:crypto";

import postgres from "postgres";
import { describe, expect, it, vi } from "vitest";

import { deleteAccount, hardDeleteAccount } from "@/app/accounts/[id]/delete-actions";
import { PgAccountRepository } from "@/db/postgres/repositories/account-repository";
import { PgInstitutionRepository } from "@/db/postgres/repositories/institution-repository";
import { AccountRepository } from "@/db/repositories/account-repository";
import { FixedDepositRepository } from "@/db/repositories/fixed-deposit-repository";
import { InstitutionRepository } from "@/db/repositories/institution-repository";
import { createTestDb } from "@/db/repositories/test-db";
import { TransactionRepository } from "@/db/repositories/transaction-repository";

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

function formData(accountId: string, institutionId: string): FormData {
  const data = new FormData();
  data.set("accountId", accountId);
  data.set("institutionId", institutionId);
  return data;
}

describe("deleteAccount", () => {
  it("deletes a childless Account and redirects to its Institution", async () => {
    const testDb = createTestDb();
    await new InstitutionRepository(testDb.db).create({ id: "inst-1", name: "Bank One" });
    const accounts = new AccountRepository(testDb.db);
    await accounts.create({
      id: "acc-1",
      institutionId: "inst-1",
      name: "Savings",
      accountNumber: null,
      currencyCode: "INR"
    });
    const redirectTo = vi.fn();

    const result = await deleteAccount({}, formData("acc-1", "inst-1"), {
      db: testDb.db,
      redirectTo
    });

    expect(result).toEqual({});
    expect(await accounts.getById("acc-1")).toBeNull();
    expect(redirectTo).toHaveBeenCalledWith("/institutions/inst-1?message=bank_account_deleted");
  });

  it("returns a form error and does not delete when the Account still has Transactions", async () => {
    const testDb = createTestDb();
    await new InstitutionRepository(testDb.db).create({ id: "inst-1", name: "Bank One" });
    const accounts = new AccountRepository(testDb.db);
    await accounts.create({
      id: "acc-1",
      institutionId: "inst-1",
      name: "Savings",
      accountNumber: null,
      currencyCode: "INR"
    });
    await new TransactionRepository(testDb.db).create({
      id: "txn-1",
      accountId: "acc-1",
      amountMinor: 1000,
      occurredAt: "2026-01-01T00:00:00.000Z",
      description: "Deposit",
      trustStatus: "Confirmed",
      transferId: null,
      category: null,
      importBatchId: null
    });
    const redirectTo = vi.fn();

    const result = await deleteAccount({}, formData("acc-1", "inst-1"), {
      db: testDb.db,
      redirectTo
    });

    expect(result.formError).toBeDefined();
    expect(await accounts.getById("acc-1")).not.toBeNull();
    expect(redirectTo).not.toHaveBeenCalled();
  });

  it("deletes from the Postgres repository, scoped to the owner, when an owner is resolved", async () => {
    const ownerId = randomUUID();
    const institution = { id: randomUUID(), name: "Cloud Bank" };
    const account = {
      id: randomUUID(),
      institutionId: institution.id,
      name: "Savings",
      accountNumber: null,
      currencyCode: "INR"
    };
    await new PgInstitutionRepository(TEST_DATABASE_URL, ownerId).create(institution);
    const pgAccounts = new PgAccountRepository(TEST_DATABASE_URL, ownerId);
    await pgAccounts.create(account);
    const redirectTo = vi.fn();

    try {
      const result = await deleteAccount({}, formData(account.id, institution.id), {
        getCurrentOwnerId: async () => ownerId,
        isCloudMode: () => true,
        postgresConnectionString: TEST_DATABASE_URL,
        redirectTo
      });

      expect(result).toEqual({});
      expect(await pgAccounts.getById(account.id)).toBeNull();
      expect(redirectTo).toHaveBeenCalledWith(`/institutions/${institution.id}?message=bank_account_deleted`);
    } finally {
      const admin = postgres(TEST_DATABASE_URL, { max: 1 });
      await admin`delete from accounts where id = ${account.id}`;
      await admin`delete from institutions where id = ${institution.id}`;
      await admin.end();
    }
  });
});

describe("hardDeleteAccount", () => {
  it("hard-deletes an Account with Transactions and redirects to its Institution", async () => {
    const testDb = createTestDb();
    await new InstitutionRepository(testDb.db).create({ id: "inst-1", name: "Bank One" });
    const accounts = new AccountRepository(testDb.db);
    await accounts.create({
      id: "acc-1",
      institutionId: "inst-1",
      name: "Savings",
      accountNumber: null,
      currencyCode: "INR"
    });
    await new TransactionRepository(testDb.db).create({
      id: "txn-1",
      accountId: "acc-1",
      amountMinor: 1000,
      occurredAt: "2026-01-01T00:00:00.000Z",
      description: "Deposit",
      trustStatus: "Confirmed",
      transferId: null,
      category: null,
      importBatchId: null
    });
    const redirectTo = vi.fn();

    const result = await hardDeleteAccount({}, formData("acc-1", "inst-1"), {
      db: testDb.db,
      redirectTo
    });

    expect(result).toEqual({});
    expect(await accounts.getById("acc-1")).toBeNull();
    expect(redirectTo).toHaveBeenCalledWith("/institutions/inst-1?message=bank_account_hard_deleted");
  });

  it("returns a form error and does not delete when a FixedDeposit is linked to the Account", async () => {
    const testDb = createTestDb();
    await new InstitutionRepository(testDb.db).create({ id: "inst-1", name: "Bank One" });
    const accounts = new AccountRepository(testDb.db);
    await accounts.create({
      id: "acc-1",
      institutionId: "inst-1",
      name: "Savings",
      accountNumber: null,
      currencyCode: "INR"
    });
    await new FixedDepositRepository(testDb.db).create({
      id: "fd-1",
      name: "Term deposit",
      accountNumber: null,
      institutionId: "inst-1",
      linkedAccountId: "acc-1",
      principalMinor: 100_000,
      originalPrincipalMinor: 100_000,
      currencyCode: "INR",
      interestRateBps: 650,
      openedDate: "2026-01-01",
      maturityDate: "2027-01-01",
      status: "Open"
    });
    const redirectTo = vi.fn();

    const result = await hardDeleteAccount({}, formData("acc-1", "inst-1"), {
      db: testDb.db,
      redirectTo
    });

    expect(result.formError).toBeDefined();
    expect(await accounts.getById("acc-1")).not.toBeNull();
    expect(redirectTo).not.toHaveBeenCalled();
  });

  it("hard-deletes from the Postgres repository, scoped to the owner, when an owner is resolved", async () => {
    const ownerId = randomUUID();
    const institution = { id: randomUUID(), name: "Cloud Bank" };
    const account = {
      id: randomUUID(),
      institutionId: institution.id,
      name: "Savings",
      accountNumber: null,
      currencyCode: "INR"
    };
    await new PgInstitutionRepository(TEST_DATABASE_URL, ownerId).create(institution);
    const pgAccounts = new PgAccountRepository(TEST_DATABASE_URL, ownerId);
    await pgAccounts.create(account);
    const redirectTo = vi.fn();

    try {
      const result = await hardDeleteAccount({}, formData(account.id, institution.id), {
        getCurrentOwnerId: async () => ownerId,
        isCloudMode: () => true,
        postgresConnectionString: TEST_DATABASE_URL,
        redirectTo
      });

      expect(result).toEqual({});
      expect(await pgAccounts.getById(account.id)).toBeNull();
      expect(redirectTo).toHaveBeenCalledWith(
        `/institutions/${institution.id}?message=bank_account_hard_deleted`
      );
    } finally {
      const admin = postgres(TEST_DATABASE_URL, { max: 1 });
      await admin`delete from accounts where id = ${account.id}`;
      await admin`delete from institutions where id = ${institution.id}`;
      await admin.end();
    }
  });
});
