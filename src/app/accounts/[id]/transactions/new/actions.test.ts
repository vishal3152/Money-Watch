import { randomUUID } from "node:crypto";

import postgres from "postgres";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { resetIdempotencyKeysForTests } from "@/app/duplicate-submission-guard";
import {
  createTransaction,
  type TransactionFormState
} from "@/app/accounts/[id]/transactions/new/actions";
import { computeAccountBalance } from "@/domain/account-balance";
import { PgAccountRepository } from "@/db/postgres/repositories/account-repository";
import { PgInstitutionRepository } from "@/db/postgres/repositories/institution-repository";
import { PgTransactionRepository } from "@/db/postgres/repositories/transaction-repository";
import { AccountRepository } from "@/db/repositories/account-repository";
import { InstitutionRepository } from "@/db/repositories/institution-repository";
import { TransactionRepository } from "@/db/repositories/transaction-repository";
import { createTestDb } from "@/db/repositories/test-db";

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

function transactionFormData({
  amount,
  kind = "Income",
  category = "Salary"
}: {
  amount: string;
  kind?: string;
  category?: string;
}): FormData {
  const formData = new FormData();
  formData.set("accountId", "acc-1");
  formData.set("amount", amount);
  formData.set("kind", kind);
  formData.set("category", category);
  formData.set("description", "Opening balance");
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

describe("createTransaction", () => {
  beforeEach(() => {
    resetIdempotencyKeysForTests();
  });

  it("rejects a second submission carrying the same idempotencyKey as a likely duplicate", async () => {
    const testDb = await seedAccount();
    const transactions = new TransactionRepository(testDb.db);

    const first = transactionFormData({ amount: "100" });
    first.set("idempotencyKey", "same-key");
    const firstResult = await createTransaction({} as TransactionFormState, first, {
      db: testDb.db,
      redirectTo: vi.fn(),
      newId: () => "txn-first"
    });
    expect(firstResult).toEqual({});

    const second = transactionFormData({ amount: "100" });
    second.set("idempotencyKey", "same-key");
    const redirectTo = vi.fn();
    const secondResult = await createTransaction({} as TransactionFormState, second, {
      db: testDb.db,
      redirectTo,
      newId: () => "txn-second"
    });

    expect(secondResult.formError).toEqual({ key: "errors.duplicateSubmission" });
    expect(redirectTo).not.toHaveBeenCalled();
    expect(await transactions.listByAccountId("acc-1")).toHaveLength(1);
  });

  it("allows two submissions with different idempotencyKeys (or none) to both persist", async () => {
    const testDb = await seedAccount();
    const transactions = new TransactionRepository(testDb.db);

    await createTransaction({} as TransactionFormState, transactionFormData({ amount: "100" }), {
      db: testDb.db,
      redirectTo: vi.fn(),
      newId: () => "txn-1"
    });
    await createTransaction({} as TransactionFormState, transactionFormData({ amount: "100" }), {
      db: testDb.db,
      redirectTo: vi.fn(),
      newId: () => "txn-2"
    });

    expect(await transactions.listByAccountId("acc-1")).toHaveLength(2);
  });


  it("rejects malformed or overflowing decimal amounts without persisting", async () => {
    const testDb = await seedAccount();
    const transactions = new TransactionRepository(testDb.db);
    const redirectTo = vi.fn();

    for (const amount of ["12.345", "9007199254740992"]) {
      const result = await createTransaction(
        {} as TransactionFormState,
        transactionFormData({ amount }),
        { db: testDb.db, redirectTo, newId: () => `txn-${amount}` }
      );
      expect(result.fieldErrors?.amount).toEqual({ key: "errors.amountInvalid" });
    }

    expect(await transactions.listByAccountId("acc-1")).toEqual([]);
    expect(redirectTo).not.toHaveBeenCalled();
  });

  it("rejects a negative amount with a message pointing at the Type selector", async () => {
    const testDb = await seedAccount();
    const transactions = new TransactionRepository(testDb.db);
    const redirectTo = vi.fn();

    const result = await createTransaction(
      {} as TransactionFormState,
      transactionFormData({ amount: "-50.00" }),
      { db: testDb.db, redirectTo, newId: () => "txn-negative" }
    );

    expect(result.fieldErrors?.amount).toEqual({ key: "errors.amountMustBePositive" });
    expect(await transactions.listByAccountId("acc-1")).toEqual([]);
    expect(redirectTo).not.toHaveBeenCalled();
  });

  it("rejects an empty description without persisting", async () => {
    const testDb = await seedAccount();
    const transactions = new TransactionRepository(testDb.db);
    const redirectTo = vi.fn();

    const formData = transactionFormData({ amount: "100" });
    formData.set("description", "   ");

    const result = await createTransaction({} as TransactionFormState, formData, {
      db: testDb.db,
      redirectTo,
      newId: () => "txn-1"
    });

    expect(result.fieldErrors?.description).toEqual({ key: "errors.descriptionRequired" });
    expect(await transactions.listByAccountId("acc-1")).toEqual([]);
    expect(redirectTo).not.toHaveBeenCalled();
  });

  it("rejects a category that does not belong to the chosen kind without persisting", async () => {
    const testDb = await seedAccount();
    const transactions = new TransactionRepository(testDb.db);
    const redirectTo = vi.fn();

    const result = await createTransaction(
      {} as TransactionFormState,
      transactionFormData({ amount: "100", kind: "Income", category: "Grocery" }),
      { db: testDb.db, redirectTo, newId: () => "txn-1" }
    );

    expect(result.fieldErrors?.category).toEqual({ key: "errors.categoryMismatch" });
    expect(await transactions.listByAccountId("acc-1")).toEqual([]);
    expect(redirectTo).not.toHaveBeenCalled();
  });

  it("persists a Confirmed Income Transaction with a positive amount and its category", async () => {
    const testDb = await seedAccount();
    const transactions = new TransactionRepository(testDb.db);
    const redirectTo = vi.fn();

    const result = await createTransaction(
      {} as TransactionFormState,
      transactionFormData({ amount: "1234.56", kind: "Income", category: "Salary" }),
      { db: testDb.db, redirectTo, newId: () => "txn-1" }
    );

    const ledger = await transactions.listByAccountId("acc-1");
    expect(result).toEqual({});
    expect(ledger).toEqual([
      {
        id: "txn-1",
        accountId: "acc-1",
        amountMinor: 123456,
        occurredAt: new Date("2026-09-05T09:30").toISOString(),
        description: "Opening balance",
        trustStatus: "Confirmed",
        transferId: null,
        category: "Salary",
        importBatchId: null,
        externalRef: null,
        possibleDuplicateOfTransactionId: null
      }
    ]);
    expect(computeAccountBalance(ledger)).toBe(123456);
    expect(redirectTo).toHaveBeenCalledWith("/accounts/acc-1?message=transaction_created");
  });

  it("persists a Confirmed Expense Transaction with a negative amount and its category", async () => {
    const testDb = await seedAccount();
    const transactions = new TransactionRepository(testDb.db);
    const redirectTo = vi.fn();

    const result = await createTransaction(
      {} as TransactionFormState,
      transactionFormData({ amount: "500.00", kind: "Expense", category: "Dining" }),
      { db: testDb.db, redirectTo, newId: () => "txn-2" }
    );

    const ledger = await transactions.listByAccountId("acc-1");
    expect(result).toEqual({});
    expect(ledger).toEqual([
      {
        id: "txn-2",
        accountId: "acc-1",
        amountMinor: -50000,
        occurredAt: new Date("2026-09-05T09:30").toISOString(),
        description: "Opening balance",
        trustStatus: "Confirmed",
        transferId: null,
        category: "Dining",
        importBatchId: null,
        externalRef: null,
        possibleDuplicateOfTransactionId: null
      }
    ]);
    expect(computeAccountBalance(ledger)).toBe(-50000);
    expect(redirectTo).toHaveBeenCalledWith("/accounts/acc-1?message=transaction_created");
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
    const id = randomUUID();
    const redirectTo = vi.fn();
    const formData = new FormData();
    formData.set("accountId", account.id);
    formData.set("amount", "1234.56");
    formData.set("kind", "Income");
    formData.set("category", "Salary");
    formData.set("description", "Opening balance");
    formData.set("occurredAt", "2026-09-05T09:30");

    try {
      const result = await createTransaction({} as TransactionFormState, formData, {
        getCurrentOwnerId: async () => ownerId,
        isCloudMode: () => true,
        postgresConnectionString: TEST_DATABASE_URL,
        redirectTo,
        newId: () => id
      });

      expect(result).toEqual({});
      const pgTransactions = new PgTransactionRepository(TEST_DATABASE_URL, ownerId);
      expect(await pgTransactions.listByAccountId(account.id)).toEqual([
        {
          id,
          accountId: account.id,
          amountMinor: 123456,
          occurredAt: new Date("2026-09-05T09:30").toISOString(),
          description: "Opening balance",
          trustStatus: "Confirmed",
          transferId: null,
          category: "Salary",
          importBatchId: null,
          externalRef: null,
          possibleDuplicateOfTransactionId: null
        }
      ]);
      expect(redirectTo).toHaveBeenCalledWith(`/accounts/${account.id}?message=transaction_created`);
    } finally {
      const admin = postgres(TEST_DATABASE_URL, { max: 1 });
      await admin`delete from transactions where id = ${id}`;
      await admin`delete from accounts where id = ${account.id}`;
      await admin`delete from institutions where id = ${institution.id}`;
      await admin.end();
    }
  });
});
