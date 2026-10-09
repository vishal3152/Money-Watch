import { describe, expect, it } from "vitest";

import { computeAccountBalance } from "@/domain/account-balance";
import { AccountRepository } from "@/db/repositories/account-repository";
import { BalanceSnapshotRepository } from "@/db/repositories/balance-snapshot-repository";
import { InstitutionRepository } from "@/db/repositories/institution-repository";
import { ReconciliationRepository } from "@/db/repositories/reconciliation-repository";
import { TransactionNotEditableError, TransactionNotFoundError } from "@/db/errors";
import { createTestDb } from "@/db/repositories/test-db";
import { TransactionRepository } from "@/db/repositories/transaction-repository";
import { TransferRepository } from "@/db/repositories/transfer-repository";
import { InvalidMinorUnitsError } from "@/domain/money";

async function seedTransferLinkedTransaction(testDb: ReturnType<typeof createTestDb>) {
  await seedAccount(testDb);
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
    sourceAmountMinor: 1_500_00,
    sourceCurrencyCode: "INR",
    destinationAccountId: "acc-2",
    destinationFixedDepositId: null,
    destinationAmountMinor: 1_500_00,
    destinationCurrencyCode: "INR",
    occurredAt: "2026-01-15T00:00:00.000Z",
    description: "Transfer leg",
    purpose: "general"
  });
  return new TransactionRepository(testDb.db);
}

async function seedAdjustmentLinkedTransaction(testDb: ReturnType<typeof createTestDb>) {
  await seedAccount(testDb);
  const transactionRepository = new TransactionRepository(testDb.db);
  await transactionRepository.create({
    id: "txn-base",
    accountId: "acc-1",
    amountMinor: 100_000,
    occurredAt: "2026-01-10T00:00:00.000Z",
    description: "Deposit",
    trustStatus: "Confirmed",
    transferId: null,
    category: "Salary",
    importBatchId: null
  });
  await new BalanceSnapshotRepository(testDb.db).create({
    id: "snap-1",
    accountId: "acc-1",
    asOfDate: "2026-01-31",
    balanceMinor: 105_000
  });
  const reconciliations = new ReconciliationRepository(testDb.db);
  await reconciliations.create({
    id: "recon-1",
    accountId: "acc-1",
    balanceSnapshotId: "snap-1",
    reconciledAt: "2026-02-01T00:00:00.000Z"
  });
  await reconciliations.resolveWithAdjustment("recon-1-discrepancy", {
    id: "adj-txn-1",
    accountId: "acc-1",
    amountMinor: 5_000,
    occurredAt: "2026-02-01T00:00:00.000Z",
    description: "Owner correction"
  });
  return transactionRepository;
}

async function seedAccount(testDb: ReturnType<typeof createTestDb>) {
  await new InstitutionRepository(testDb.db).create({ id: "inst-1", name: "Bank One" });
  await new AccountRepository(testDb.db).create({
    id: "acc-1",
    institutionId: "inst-1",
    name: "Primary Checking",
    accountNumber: null,
    currencyCode: "INR"
  });
}

describe("TransactionRepository", () => {
  it("stores signed minor units with trust status and returns account transactions in chronological order", async () => {
    const testDb = createTestDb();

    const accountRepository = new AccountRepository(testDb.db);
    const institutionRepository = new InstitutionRepository(testDb.db);
    const transactionRepository = new TransactionRepository(testDb.db);

    await institutionRepository.create({ id: "inst-1", name: "Bank One" });

    await accountRepository.create({
      id: "acc-1",
      institutionId: "inst-1",
      name: "Primary Checking",
      accountNumber: null,
      currencyCode: "INR"
    });

    await transactionRepository.create({
      id: "txn-2",
      accountId: "acc-1",
      amountMinor: -30_000,
      occurredAt: "2026-01-02T09:00:00.000Z",
      description: "ATM withdrawal",
      trustStatus: "Imported",
      transferId: null,
      category: "Other",
      importBatchId: null
    });
    await transactionRepository.create({
      id: "txn-1",
      accountId: "acc-1",
      amountMinor: 120_000,
      occurredAt: "2026-01-01T09:00:00.000Z",
      description: "Salary",
      trustStatus: "Confirmed",
      transferId: null,
      category: "Salary",
      importBatchId: null
    });

    const accountTransactions = await transactionRepository.listByAccountId("acc-1");
    const balanceMinor = computeAccountBalance(accountTransactions);

    expect(accountTransactions).toEqual([
      {
        id: "txn-1",
        accountId: "acc-1",
        amountMinor: 120_000,
        occurredAt: "2026-01-01T09:00:00.000Z",
        description: "Salary",
        trustStatus: "Confirmed",
        transferId: null,
        category: "Salary",
        importBatchId: null,
        externalRef: null,
        possibleDuplicateOfTransactionId: null
      },
      {
        id: "txn-2",
        accountId: "acc-1",
        amountMinor: -30_000,
        occurredAt: "2026-01-02T09:00:00.000Z",
        description: "ATM withdrawal",
        trustStatus: "Imported",
        transferId: null,
        category: "Other",
        importBatchId: null,
        externalRef: null,
        possibleDuplicateOfTransactionId: null
      }
    ]);
    expect(balanceMinor).toBe(90_000);
  });

  it("persists a null category for Transfer/Adjustment-style rows and rejects an unknown category value", async () => {
    const testDb = createTestDb();

    const accountRepository = new AccountRepository(testDb.db);
    const institutionRepository = new InstitutionRepository(testDb.db);
    const transactionRepository = new TransactionRepository(testDb.db);

    await institutionRepository.create({ id: "inst-1", name: "Bank One" });
    await accountRepository.create({
      id: "acc-1",
      institutionId: "inst-1",
      name: "Primary Checking",
      accountNumber: null,
      currencyCode: "INR"
    });

    await transactionRepository.create({
      id: "txn-no-category",
      accountId: "acc-1",
      amountMinor: 500,
      occurredAt: "2026-01-01T00:00:00Z",
      description: "Transfer leg",
      trustStatus: "Confirmed",
      transferId: null,
      category: null,
      importBatchId: null
    });

    const [stored] = await transactionRepository.listByAccountId("acc-1");
    expect(stored?.category).toBeNull();

    await expect(
      transactionRepository.create({
        id: "txn-bad-category",
        accountId: "acc-1",
        amountMinor: 500,
        occurredAt: "2026-01-01T00:00:00Z",
        description: "Bad category",
        trustStatus: "Confirmed",
        transferId: null,
        category: "Not A Category" as never,
        importBatchId: null
      })
    ).rejects.toThrow();
  });

  it("normalizes timestamp offsets before ordering transactions", async () => {
    const testDb = createTestDb();

    const accountRepository = new AccountRepository(testDb.db);
    const institutionRepository = new InstitutionRepository(testDb.db);
    const transactionRepository = new TransactionRepository(testDb.db);

    await institutionRepository.create({ id: "inst-1", name: "Bank One" });
    await accountRepository.create({
      id: "acc-1",
      institutionId: "inst-1",
      name: "Primary Checking",
      accountNumber: null,
      currencyCode: "INR"
    });

    await transactionRepository.create({
      id: "txn-later",
      accountId: "acc-1",
      amountMinor: 200,
      occurredAt: "2026-01-01T01:00:00Z",
      description: "Later",
      trustStatus: "Confirmed",
      transferId: null,
      category: null,
      importBatchId: null
    });
    await transactionRepository.create({
      id: "txn-earlier",
      accountId: "acc-1",
      amountMinor: 100,
      occurredAt: "2026-01-01T10:00:00+10:00",
      description: "Earlier",
      trustStatus: "Confirmed",
      transferId: null,
      category: null,
      importBatchId: null
    });

    const transactions = await transactionRepository.listByAccountId("acc-1");

    expect(transactions.map(({ id, occurredAt }) => ({ id, occurredAt }))).toEqual([
      { id: "txn-earlier", occurredAt: "2026-01-01T00:00:00.000Z" },
      { id: "txn-later", occurredAt: "2026-01-01T01:00:00.000Z" }
    ]);
  });

  it("rejects fractional minor units", async () => {
    const testDb = createTestDb();

    const accountRepository = new AccountRepository(testDb.db);
    const institutionRepository = new InstitutionRepository(testDb.db);
    const transactionRepository = new TransactionRepository(testDb.db);

    await institutionRepository.create({ id: "inst-1", name: "Bank One" });
    await accountRepository.create({
      id: "acc-1",
      institutionId: "inst-1",
      name: "Primary Checking",
      accountNumber: null,
      currencyCode: "INR"
    });

    await expect(
      transactionRepository.create({
        id: "txn-1",
        accountId: "acc-1",
        amountMinor: 1.5,
        occurredAt: "2026-01-01T00:00:00Z",
        description: "Invalid fraction",
        trustStatus: "Confirmed",
        transferId: null,
        category: null,
        importBatchId: null
      })
    ).rejects.toBeInstanceOf(InvalidMinorUnitsError);
  });

  describe("update", () => {
    it("updates an Imported Transaction's amount, description, category, and date", async () => {
      const testDb = createTestDb();
      await seedAccount(testDb);
      const transactionRepository = new TransactionRepository(testDb.db);

      await transactionRepository.create({
        id: "txn-1",
        accountId: "acc-1",
        amountMinor: -1_500_00,
        occurredAt: "2026-01-15T00:00:00.000Z",
        description: "Grocery run",
        trustStatus: "Imported",
        transferId: null,
        category: "Grocery",
        importBatchId: null
      });

      const updated = await transactionRepository.update("txn-1", {
        amountMinor: -1_600_00,
        description: "Grocery run (corrected)",
        category: "Dining",
        occurredAt: "2026-01-16T00:00:00.000Z"
      });

      expect(updated).toEqual({
        id: "txn-1",
        accountId: "acc-1",
        amountMinor: -1_600_00,
        occurredAt: "2026-01-16T00:00:00.000Z",
        description: "Grocery run (corrected)",
        trustStatus: "Imported",
        transferId: null,
        category: "Dining",
        importBatchId: null,
        externalRef: null,
        possibleDuplicateOfTransactionId: null
      });

      const [stored] = await transactionRepository.listByAccountId("acc-1");
      expect(stored).toEqual(updated);
    });

    it("updates a manually-entered Confirmed Transaction's amount, description, category, and date", async () => {
      const testDb = createTestDb();
      await seedAccount(testDb);
      const transactionRepository = new TransactionRepository(testDb.db);

      await transactionRepository.create({
        id: "txn-1",
        accountId: "acc-1",
        amountMinor: -1_500_00,
        occurredAt: "2026-01-15T00:00:00.000Z",
        description: "Grocery run",
        trustStatus: "Confirmed",
        transferId: null,
        category: "Grocery",
        importBatchId: null
      });

      const updated = await transactionRepository.update("txn-1", {
        amountMinor: -1_600_00,
        description: "Grocery run (corrected)",
        category: "Dining",
        occurredAt: "2026-01-16T00:00:00.000Z"
      });

      expect(updated).toEqual({
        id: "txn-1",
        accountId: "acc-1",
        amountMinor: -1_600_00,
        occurredAt: "2026-01-16T00:00:00.000Z",
        description: "Grocery run (corrected)",
        trustStatus: "Confirmed",
        transferId: null,
        category: "Dining",
        importBatchId: null,
        externalRef: null,
        possibleDuplicateOfTransactionId: null
      });

      const [stored] = await transactionRepository.listByAccountId("acc-1");
      expect(stored).toEqual(updated);
    });

    it("rejects updating a Transfer-linked Transaction, without changing it", async () => {
      const testDb = createTestDb();
      const transactionRepository = await seedTransferLinkedTransaction(testDb);

      await expect(
        transactionRepository.update("xfer-1-source", { description: "Changed" })
      ).rejects.toBeInstanceOf(TransactionNotEditableError);

      const sourceLeg = await transactionRepository.getById("xfer-1-source");
      expect(sourceLeg?.description).toBe("Transfer leg");
    });

    it("rejects updating an Adjustment Transaction, without changing it", async () => {
      const testDb = createTestDb();
      const transactionRepository = await seedAdjustmentLinkedTransaction(testDb);

      await expect(
        transactionRepository.update("adj-txn-1", { description: "Changed" })
      ).rejects.toBeInstanceOf(TransactionNotEditableError);

      const adjustmentTransaction = await transactionRepository.getById("adj-txn-1");
      expect(adjustmentTransaction?.description).toBe("Owner correction");
    });

    it("throws on an unknown transaction id", async () => {
      const testDb = createTestDb();

      const transactionRepository = new TransactionRepository(testDb.db);

      await expect(
        transactionRepository.update("missing-txn", { description: "Changed" })
      ).rejects.toBeInstanceOf(TransactionNotFoundError);
    });
  });

  describe("dismissSuspectedDuplicate", () => {
    it("clears possibleDuplicateOfTransactionId without changing any other field", async () => {
      const testDb = createTestDb();
      await seedAccount(testDb);
      const transactionRepository = new TransactionRepository(testDb.db);
      await transactionRepository.create({
        id: "original-txn",
        accountId: "acc-1",
        amountMinor: -1_500_00,
        occurredAt: "2026-01-15T00:00:00.000Z",
        description: "Grocery run",
        trustStatus: "Confirmed",
        transferId: null,
        category: "Grocery",
        importBatchId: null
      });
      await transactionRepository.create({
        id: "flagged-txn",
        accountId: "acc-1",
        amountMinor: -1_500_00,
        occurredAt: "2026-01-15T00:00:00.000Z",
        description: "Grocery run [REF123]",
        trustStatus: "Imported",
        transferId: null,
        category: "Grocery",
        importBatchId: null,
        possibleDuplicateOfTransactionId: "original-txn"
      });

      const dismissed = await transactionRepository.dismissSuspectedDuplicate("flagged-txn");

      expect(dismissed.possibleDuplicateOfTransactionId).toBeNull();
      expect(dismissed.description).toBe("Grocery run [REF123]");
      const stored = await transactionRepository.getById("flagged-txn");
      expect(stored?.possibleDuplicateOfTransactionId).toBeNull();
    });

    it("throws on an unknown transaction id", async () => {
      const testDb = createTestDb();

      const transactionRepository = new TransactionRepository(testDb.db);

      await expect(transactionRepository.dismissSuspectedDuplicate("missing-txn")).rejects.toBeInstanceOf(
        TransactionNotFoundError
      );
    });
  });

  describe("delete", () => {
    it("deletes a manually-entered Confirmed Transaction", async () => {
      const testDb = createTestDb();
      await seedAccount(testDb);
      const transactionRepository = new TransactionRepository(testDb.db);

      await transactionRepository.create({
        id: "txn-1",
        accountId: "acc-1",
        amountMinor: -1_500_00,
        occurredAt: "2026-01-15T00:00:00.000Z",
        description: "Grocery run",
        trustStatus: "Confirmed",
        transferId: null,
        category: "Grocery",
        importBatchId: null
      });

      await transactionRepository.delete("txn-1");

      expect(await transactionRepository.getById("txn-1")).toBeNull();
    });

    it("rejects deleting a Transfer-linked Transaction", async () => {
      const testDb = createTestDb();
      const transactionRepository = await seedTransferLinkedTransaction(testDb);

      await expect(transactionRepository.delete("xfer-1-source")).rejects.toBeInstanceOf(
        TransactionNotEditableError
      );
      expect(await transactionRepository.getById("xfer-1-source")).not.toBeNull();
    });

    it("rejects deleting an Adjustment Transaction", async () => {
      const testDb = createTestDb();
      const transactionRepository = await seedAdjustmentLinkedTransaction(testDb);

      await expect(transactionRepository.delete("adj-txn-1")).rejects.toBeInstanceOf(
        TransactionNotEditableError
      );
      expect(await transactionRepository.getById("adj-txn-1")).not.toBeNull();
    });

    it("no-ops for an unknown transaction id", async () => {
      const testDb = createTestDb();
      const transactionRepository = new TransactionRepository(testDb.db);

      await expect(transactionRepository.delete("missing-txn")).resolves.toBeUndefined();
    });
  });

  describe("getById", () => {
    it("returns a single Transaction by id without fetching the rest of the ledger", async () => {
      const testDb = createTestDb();
      await seedAccount(testDb);
      const transactionRepository = new TransactionRepository(testDb.db);

      await transactionRepository.create({
        id: "txn-1",
        accountId: "acc-1",
        amountMinor: 500,
        occurredAt: "2026-01-01T00:00:00.000Z",
        description: "Adjustment",
        trustStatus: "Confirmed",
        transferId: null,
        category: null,
        importBatchId: null
      });

      expect(await transactionRepository.getById("txn-1")).toEqual({
        id: "txn-1",
        accountId: "acc-1",
        amountMinor: 500,
        occurredAt: "2026-01-01T00:00:00.000Z",
        description: "Adjustment",
        trustStatus: "Confirmed",
        transferId: null,
        category: null,
        importBatchId: null,
        externalRef: null,
        possibleDuplicateOfTransactionId: null
      });
    });

    it("returns null for an unknown id", async () => {
      const testDb = createTestDb();

      expect(await new TransactionRepository(testDb.db).getById("missing-txn")).toBeNull();
    });
  });

  describe("countByAccountId", () => {
    it("counts an Account's Transactions without loading the ledger", async () => {
      const testDb = createTestDb();
      await seedAccount(testDb);
      await new AccountRepository(testDb.db).create({
        id: "acc-2",
        institutionId: "inst-1",
        name: "Savings",
        accountNumber: null,
        currencyCode: "INR"
      });

      const transactionRepository = new TransactionRepository(testDb.db);
      await transactionRepository.create({
        id: "txn-1",
        accountId: "acc-1",
        amountMinor: 120_000,
        occurredAt: "2026-01-01T09:00:00.000Z",
        description: "Salary",
        trustStatus: "Confirmed",
        transferId: null,
        category: "Salary",
        importBatchId: null
      });
      await transactionRepository.create({
        id: "txn-2",
        accountId: "acc-1",
        amountMinor: -30_000,
        occurredAt: "2026-01-02T09:00:00.000Z",
        description: "ATM withdrawal",
        trustStatus: "Imported",
        transferId: null,
        category: "Other",
        importBatchId: null
      });
      await transactionRepository.create({
        id: "txn-3",
        accountId: "acc-2",
        amountMinor: 5_000,
        occurredAt: "2026-01-03T09:00:00.000Z",
        description: "Interest",
        trustStatus: "Confirmed",
        transferId: null,
        category: "Interest",
        importBatchId: null
      });

      expect(await transactionRepository.countByAccountId("acc-1")).toBe(2);
      expect(await transactionRepository.countByAccountId("acc-2")).toBe(1);
    });

    it("returns 0 for an Account with no Transactions", async () => {
      const testDb = createTestDb();
      await seedAccount(testDb);

      expect(await new TransactionRepository(testDb.db).countByAccountId("acc-1")).toBe(0);
    });
  });

  describe("sumAmountsByAccountIds", () => {
    it("sums each requested Account's Transactions in one query, omitting Accounts with none", async () => {
      const testDb = createTestDb();
      await seedAccount(testDb);
      await new AccountRepository(testDb.db).create({
        id: "acc-2",
        institutionId: "inst-1",
        name: "Savings",
        accountNumber: null,
        currencyCode: "INR"
      });
      await new AccountRepository(testDb.db).create({
        id: "acc-3",
        institutionId: "inst-1",
        name: "Untouched",
        accountNumber: null,
        currencyCode: "INR"
      });

      const transactionRepository = new TransactionRepository(testDb.db);
      await transactionRepository.create({
        id: "txn-1",
        accountId: "acc-1",
        amountMinor: 120_000,
        occurredAt: "2026-01-01T09:00:00.000Z",
        description: "Salary",
        trustStatus: "Confirmed",
        transferId: null,
        category: "Salary",
        importBatchId: null
      });
      await transactionRepository.create({
        id: "txn-2",
        accountId: "acc-1",
        amountMinor: -30_000,
        occurredAt: "2026-01-02T09:00:00.000Z",
        description: "ATM withdrawal",
        trustStatus: "Imported",
        transferId: null,
        category: "Other",
        importBatchId: null
      });
      await transactionRepository.create({
        id: "txn-3",
        accountId: "acc-2",
        amountMinor: 5_000,
        occurredAt: "2026-01-03T09:00:00.000Z",
        description: "Interest",
        trustStatus: "Confirmed",
        transferId: null,
        category: "Interest",
        importBatchId: null
      });

      const totals = await transactionRepository.sumAmountsByAccountIds(["acc-1", "acc-2", "acc-3"]);

      expect(totals.sort((a, b) => a.accountId.localeCompare(b.accountId))).toEqual([
        { accountId: "acc-1", balanceMinor: 90_000 },
        { accountId: "acc-2", balanceMinor: 5_000 }
      ]);
    });

    it("returns an empty array for an empty input", async () => {
      const testDb = createTestDb();
      const transactionRepository = new TransactionRepository(testDb.db);

      expect(await transactionRepository.sumAmountsByAccountIds([])).toEqual([]);
    });
  });

  describe("listPageByAccountId", () => {
    /** Six Transactions across three months, with two distinct descriptions. */
    async function seedLedger(testDb: ReturnType<typeof createTestDb>) {
      await seedAccount(testDb);
      const repository = new TransactionRepository(testDb.db);
      const rows = [
        { id: "t1", occurredAt: "2026-01-05T00:00:00.000Z", description: "Groceries" },
        { id: "t2", occurredAt: "2026-01-20T00:00:00.000Z", description: "Rent" },
        { id: "t3", occurredAt: "2026-02-05T00:00:00.000Z", description: "GROCERIES weekly" },
        { id: "t4", occurredAt: "2026-02-20T00:00:00.000Z", description: "Rent" },
        { id: "t5", occurredAt: "2026-03-05T00:00:00.000Z", description: "Fuel 50% off" },
        { id: "t6", occurredAt: "2026-03-20T00:00:00.000Z", description: "Rent" }
      ];
      for (const row of rows) {
        await repository.create({
          id: row.id,
          accountId: "acc-1",
          amountMinor: -1_000,
          occurredAt: row.occurredAt,
          description: row.description,
          trustStatus: "Confirmed",
          transferId: null,
          category: null,
          importBatchId: null
        });
      }
      return repository;
    }

    it("returns one chronological slice plus the unsliced total", async () => {
      const testDb = createTestDb();
      const repository = await seedLedger(testDb);

      const first = await repository.listPageByAccountId("acc-1", { limit: 2, offset: 0 });
      expect(first.rows.map((row) => row.id)).toEqual(["t1", "t2"]);
      expect(first.total).toBe(6);

      const second = await repository.listPageByAccountId("acc-1", { limit: 2, offset: 2 });
      expect(second.rows.map((row) => row.id)).toEqual(["t3", "t4"]);
      expect(second.total).toBe(6);
    });

    it("returns no rows past the end, and a zero total for an Account with none", async () => {
      const testDb = createTestDb();
      const repository = await seedLedger(testDb);

      expect(await repository.listPageByAccountId("acc-1", { limit: 5, offset: 6 })).toEqual({
        rows: [],
        total: 6
      });
      expect(await repository.listPageByAccountId("missing", { limit: 5, offset: 0 })).toEqual({
        rows: [],
        total: 0
      });
    });

    it("filters by description case-insensitively, and totals the matches not the page", async () => {
      const testDb = createTestDb();
      const repository = await seedLedger(testDb);

      const page = await repository.listPageByAccountId("acc-1", {
        limit: 1,
        offset: 0,
        search: "groceries"
      });

      expect(page.rows.map((row) => row.id)).toEqual(["t1"]);
      expect(page.total).toBe(2);
    });

    it("treats a LIKE wildcard in the search as literal text", async () => {
      const testDb = createTestDb();
      const repository = await seedLedger(testDb);

      const page = await repository.listPageByAccountId("acc-1", {
        limit: 10,
        offset: 0,
        search: "50%"
      });

      expect(page.rows.map((row) => row.id)).toEqual(["t5"]);
    });

    it("filters by calendar month", async () => {
      const testDb = createTestDb();
      const repository = await seedLedger(testDb);

      const page = await repository.listPageByAccountId("acc-1", {
        limit: 10,
        offset: 0,
        month: "2026-02"
      });

      expect(page.rows.map((row) => row.id)).toEqual(["t3", "t4"]);
      expect(page.total).toBe(2);
    });

    it("applies search and month together", async () => {
      const testDb = createTestDb();
      const repository = await seedLedger(testDb);

      const page = await repository.listPageByAccountId("acc-1", {
        limit: 10,
        offset: 0,
        search: "rent",
        month: "2026-03"
      });

      expect(page.rows.map((row) => row.id)).toEqual(["t6"]);
      expect(page.total).toBe(1);
    });

    it("excludes another Account's Transactions", async () => {
      const testDb = createTestDb();
      const repository = await seedLedger(testDb);
      await new AccountRepository(testDb.db).create({
        id: "acc-2",
        institutionId: "inst-1",
        name: "Savings",
        accountNumber: null,
        currencyCode: "INR"
      });
      await repository.create({
        id: "other",
        accountId: "acc-2",
        amountMinor: -1_000,
        occurredAt: "2026-01-06T00:00:00.000Z",
        description: "Groceries",
        trustStatus: "Confirmed",
        transferId: null,
        category: null,
        importBatchId: null
      });

      const page = await repository.listPageByAccountId("acc-1", { limit: 10, offset: 0 });

      expect(page.total).toBe(6);
      expect(page.rows.every((row) => row.accountId === "acc-1")).toBe(true);
    });
  });

  describe("listMonthsByAccountId", () => {
    it("returns each distinct month once, most recent first", async () => {
      const testDb = createTestDb();
      await seedAccount(testDb);
      const repository = new TransactionRepository(testDb.db);
      for (const [id, occurredAt] of [
        ["m1", "2026-01-05T00:00:00.000Z"],
        ["m2", "2026-01-25T00:00:00.000Z"],
        ["m3", "2026-03-05T00:00:00.000Z"]
      ]) {
        await repository.create({
          id,
          accountId: "acc-1",
          amountMinor: -1_000,
          occurredAt,
          description: "Spend",
          trustStatus: "Confirmed",
          transferId: null,
          category: null,
          importBatchId: null
        });
      }

      expect(await repository.listMonthsByAccountId("acc-1")).toEqual(["2026-03", "2026-01"]);
    });

    it("returns an empty list for an Account with no Transactions", async () => {
      const testDb = createTestDb();
      await seedAccount(testDb);

      expect(await new TransactionRepository(testDb.db).listMonthsByAccountId("acc-1")).toEqual([]);
    });
  });
});
