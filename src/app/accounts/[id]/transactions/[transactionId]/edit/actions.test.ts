import { randomUUID } from "node:crypto";

import postgres from "postgres";
import { describe, expect, it, vi } from "vitest";

import { updateTransaction, type TransactionEditFormState } from "@/app/accounts/[id]/transactions/[transactionId]/edit/actions";
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

function editFormData({
  transactionId,
  accountId,
  amount,
  kind = "Income",
  category = "Salary"
}: {
  transactionId: string;
  accountId: string;
  amount: string;
  kind?: string;
  category?: string;
}): FormData {
  const formData = new FormData();
  formData.set("transactionId", transactionId);
  formData.set("accountId", accountId);
  formData.set("amount", amount);
  formData.set("kind", kind);
  formData.set("category", category);
  formData.set("description", "Corrected entry");
  formData.set("occurredAt", "2026-09-05T09:30");
  return formData;
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

describe("updateTransaction", () => {
  it("rejects malformed decimal amounts without persisting", async () => {
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

    const result = await updateTransaction(
      {} as TransactionEditFormState,
      editFormData({ transactionId: "txn-1", accountId: "acc-1", amount: "12.345" }),
      { db: testDb.db, redirectTo }
    );

    expect(result.fieldErrors?.amount).toEqual({ key: "errors.amountInvalid" });
    expect((await transactions.getById("txn-1"))?.description).toBe("Original");
    expect(redirectTo).not.toHaveBeenCalled();
  });

  it("rejects a category that does not belong to the chosen kind without persisting", async () => {
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

    const result = await updateTransaction(
      {} as TransactionEditFormState,
      editFormData({ transactionId: "txn-1", accountId: "acc-1", amount: "100", kind: "Income", category: "Grocery" }),
      { db: testDb.db, redirectTo }
    );

    expect(result.fieldErrors?.category).toEqual({ key: "errors.categoryMismatch" });
    expect((await transactions.getById("txn-1"))?.category).toBe("Salary");
    expect(redirectTo).not.toHaveBeenCalled();
  });

  it("rejects an empty description without persisting", async () => {
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

    const formData = editFormData({ transactionId: "txn-1", accountId: "acc-1", amount: "100" });
    formData.set("description", "   ");

    const result = await updateTransaction({} as TransactionEditFormState, formData, {
      db: testDb.db,
      redirectTo
    });

    expect(result.fieldErrors?.description).toEqual({ key: "errors.descriptionRequired" });
    expect((await transactions.getById("txn-1"))?.description).toBe("Original");
    expect(redirectTo).not.toHaveBeenCalled();
  });

  it("updates a manually-entered Confirmed Transaction and redirects to the Account", async () => {
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

    const result = await updateTransaction(
      {} as TransactionEditFormState,
      editFormData({ transactionId: "txn-1", accountId: "acc-1", amount: "500.00", kind: "Expense", category: "Dining" }),
      { db: testDb.db, redirectTo }
    );

    expect(result).toEqual({});
    expect(await transactions.getById("txn-1")).toEqual({
      id: "txn-1",
      accountId: "acc-1",
      amountMinor: -50000,
      occurredAt: new Date("2026-09-05T09:30").toISOString(),
      description: "Corrected entry",
      trustStatus: "Confirmed",
      transferId: null,
      category: "Dining",
      importBatchId: null,
      externalRef: null,
      possibleDuplicateOfTransactionId: null
    });
    expect(redirectTo).toHaveBeenCalledWith("/accounts/acc-1?message=transaction_updated");
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
    const data = editFormData({ transactionId: "txn-1", accountId: "acc-1", amount: "100" });
    data.set("returnTo", "/imports/batch-1");

    const result = await updateTransaction({} as TransactionEditFormState, data, {
      db: testDb.db,
      redirectTo
    });

    expect(result).toEqual({});
    expect(redirectTo).toHaveBeenCalledWith("/imports/batch-1?message=transaction_updated");
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
    const data = editFormData({ transactionId: "txn-1", accountId: "acc-1", amount: "100" });
    data.set("returnTo", "//evil.example/");

    const result = await updateTransaction({} as TransactionEditFormState, data, {
      db: testDb.db,
      redirectTo
    });

    expect(result).toEqual({});
    expect(redirectTo).toHaveBeenCalledWith("/accounts/acc-1?message=transaction_updated");
  });

  it("returns a form error and does not change the Transaction when accountId does not match its actual Account", async () => {
    const testDb = await seedAccount();
    await new AccountRepository(testDb.db).create({
      id: "acc-2",
      institutionId: "inst-1",
      name: "Other account",
      accountNumber: null,
      currencyCode: "USD"
    });
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

    const result = await updateTransaction(
      {} as TransactionEditFormState,
      editFormData({ transactionId: "txn-1", accountId: "acc-2", amount: "500.00" }),
      { db: testDb.db, redirectTo }
    );

    expect(result.formError).toBeTruthy();
    expect((await transactions.getById("txn-1"))?.description).toBe("Original");
    expect(redirectTo).not.toHaveBeenCalled();
  });

  it("returns a form error and does not change a Transfer-linked Transaction", async () => {
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

    const result = await updateTransaction(
      {} as TransactionEditFormState,
      editFormData({ transactionId: "xfer-1-source", accountId: "acc-1", amount: "500.00" }),
      { db: testDb.db, redirectTo }
    );

    expect(result.formError).toBeTruthy();
    expect((await transactions.getById("xfer-1-source"))?.description).toBe("Transfer leg");
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
      const result = await updateTransaction(
        {} as TransactionEditFormState,
        editFormData({ transactionId, accountId: account.id, amount: "500.00", kind: "Expense", category: "Dining" }),
        {
          getCurrentOwnerId: async () => ownerId,
          isCloudMode: () => true,
          postgresConnectionString: TEST_DATABASE_URL,
          redirectTo
        }
      );

      expect(result).toEqual({});
      expect(await pgTransactions.getById(transactionId)).toEqual({
        id: transactionId,
        accountId: account.id,
        amountMinor: -50000,
        occurredAt: new Date("2026-09-05T09:30").toISOString(),
        description: "Corrected entry",
        trustStatus: "Confirmed",
        transferId: null,
        category: "Dining",
        importBatchId: null,
        externalRef: null,
        possibleDuplicateOfTransactionId: null
      });
      expect(redirectTo).toHaveBeenCalledWith(`/accounts/${account.id}?message=transaction_updated`);
    } finally {
      const admin = postgres(TEST_DATABASE_URL, { max: 1 });
      await admin`delete from transactions where id = ${transactionId}`;
      await admin`delete from accounts where id = ${account.id}`;
      await admin`delete from institutions where id = ${institution.id}`;
      await admin.end();
    }
  });
});
