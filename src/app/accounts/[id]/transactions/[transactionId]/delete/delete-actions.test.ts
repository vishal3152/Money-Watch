import { randomUUID } from "node:crypto";

import postgres from "postgres";
import { describe, expect, it, vi } from "vitest";

import { deleteTransaction } from "@/app/accounts/[id]/transactions/[transactionId]/delete/delete-actions";
import { PgAccountRepository } from "@/db/postgres/repositories/account-repository";
import { PgInstitutionRepository } from "@/db/postgres/repositories/institution-repository";
import { PgTransactionRepository } from "@/db/postgres/repositories/transaction-repository";
import { AccountRepository } from "@/db/repositories/account-repository";
import { InstitutionRepository } from "@/db/repositories/institution-repository";
import { TransactionRepository } from "@/db/repositories/transaction-repository";
import { TransferRepository } from "@/db/repositories/transfer-repository";
import { createTestDb } from "@/db/repositories/test-db";

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

function formData(transactionId: string, accountId: string, returnTo?: string): FormData {
  const data = new FormData();
  data.set("transactionId", transactionId);
  data.set("accountId", accountId);
  if (returnTo !== undefined) {
    data.set("returnTo", returnTo);
  }
  return data;
}

async function seedAccount() {
  const testDb = createTestDb();
  await new InstitutionRepository(testDb.db).create({ id: "inst-1", name: "Institution One" });
  await new AccountRepository(testDb.db).create({
    id: "acc-1",
    institutionId: "inst-1",
    name: "Everyday account",
    accountNumber: null,
    currencyCode: "INR"
  });
  return testDb;
}

describe("deleteTransaction", () => {
  it("deletes a manually-entered Confirmed Transaction and redirects to the Account", async () => {
    const testDb = await seedAccount();
    const transactions = new TransactionRepository(testDb.db);
    await transactions.create({
      id: "txn-1",
      accountId: "acc-1",
      amountMinor: 100_000,
      occurredAt: "2026-01-01T00:00:00.000Z",
      description: "Original",
      trustStatus: "Confirmed",
      transferId: null,
      category: "Salary",
      importBatchId: null
    });
    const redirectTo = vi.fn();

    const result = await deleteTransaction({}, formData("txn-1", "acc-1"), {
      db: testDb.db,
      redirectTo
    });

    expect(result).toEqual({});
    expect(await transactions.getById("txn-1")).toBeNull();
    expect(redirectTo).toHaveBeenCalledWith("/accounts/acc-1?message=transaction_deleted");
  });

  it("redirects to a valid returnTo path instead of the Account when provided", async () => {
    const testDb = await seedAccount();
    const transactions = new TransactionRepository(testDb.db);
    await transactions.create({
      id: "txn-1",
      accountId: "acc-1",
      amountMinor: 100_000,
      occurredAt: "2026-01-01T00:00:00.000Z",
      description: "Original",
      trustStatus: "Confirmed",
      transferId: null,
      category: "Salary",
      importBatchId: null
    });
    const redirectTo = vi.fn();

    const result = await deleteTransaction(
      {},
      formData("txn-1", "acc-1", "/imports/batch-1"),
      { db: testDb.db, redirectTo }
    );

    expect(result).toEqual({});
    expect(redirectTo).toHaveBeenCalledWith("/imports/batch-1?message=transaction_deleted");
  });

  it("ignores an unsafe returnTo and falls back to the Account", async () => {
    const testDb = await seedAccount();
    const transactions = new TransactionRepository(testDb.db);
    await transactions.create({
      id: "txn-1",
      accountId: "acc-1",
      amountMinor: 100_000,
      occurredAt: "2026-01-01T00:00:00.000Z",
      description: "Original",
      trustStatus: "Confirmed",
      transferId: null,
      category: "Salary",
      importBatchId: null
    });
    const redirectTo = vi.fn();

    const result = await deleteTransaction(
      {},
      formData("txn-1", "acc-1", "https://evil.example/"),
      { db: testDb.db, redirectTo }
    );

    expect(result).toEqual({});
    expect(redirectTo).toHaveBeenCalledWith("/accounts/acc-1?message=transaction_deleted");
  });

  it("returns a form error and does not delete a Transfer-linked Transaction", async () => {
    const testDb = await seedAccount();
    await new AccountRepository(testDb.db).create({
      id: "acc-2",
      institutionId: "inst-1",
      name: "Savings",
      accountNumber: null,
      currencyCode: "INR"
    });
    await new TransferRepository(testDb.db).create({
      id: "xfer-1",
      sourceAccountId: "acc-1",
      sourceFixedDepositId: null,
      sourceAmountMinor: 1000,
      sourceCurrencyCode: "INR",
      destinationAccountId: "acc-2",
      destinationFixedDepositId: null,
      destinationAmountMinor: 1000,
      destinationCurrencyCode: "INR",
      occurredAt: "2026-01-01T00:00:00.000Z",
      description: "Transfer leg",
      purpose: "general"
    });
    const transactions = new TransactionRepository(testDb.db);
    const redirectTo = vi.fn();

    const result = await deleteTransaction({}, formData("xfer-1-source", "acc-1"), {
      db: testDb.db,
      redirectTo
    });

    expect(result.formError).toBeTruthy();
    expect(await transactions.getById("xfer-1-source")).not.toBeNull();
    expect(redirectTo).not.toHaveBeenCalled();
  });

  it("persists to the Postgres repository, scoped to the owner, when an owner is resolved", async () => {
    const ownerId = randomUUID();
    const institution = { id: randomUUID(), name: "Cloud Bank" };
    const account = {
      id: randomUUID(),
      institutionId: institution.id,
      name: "Everyday account",
      accountNumber: null,
      currencyCode: "INR"
    };
    await new PgInstitutionRepository(TEST_DATABASE_URL, ownerId).create(institution);
    await new PgAccountRepository(TEST_DATABASE_URL, ownerId).create(account);
    const pgTransactions = new PgTransactionRepository(TEST_DATABASE_URL, ownerId);
    const transactionId = randomUUID();
    await pgTransactions.create({
      id: transactionId,
      accountId: account.id,
      amountMinor: 100_000,
      occurredAt: "2026-01-01T00:00:00.000Z",
      description: "Original",
      trustStatus: "Confirmed",
      transferId: null,
      category: "Salary",
      importBatchId: null
    });
    const redirectTo = vi.fn();

    try {
      const result = await deleteTransaction({}, formData(transactionId, account.id), {
        getCurrentOwnerId: async () => ownerId,
        isCloudMode: () => true,
        postgresConnectionString: TEST_DATABASE_URL,
        redirectTo
      });

      expect(result).toEqual({});
      expect(await pgTransactions.getById(transactionId)).toBeNull();
      expect(redirectTo).toHaveBeenCalledWith(`/accounts/${account.id}?message=transaction_deleted`);
    } finally {
      const admin = postgres(TEST_DATABASE_URL, { max: 1 });
      await admin`delete from transactions where id = ${transactionId}`;
      await admin`delete from accounts where id = ${account.id}`;
      await admin`delete from institutions where id = ${institution.id}`;
      await admin.end();
    }
  });
});
