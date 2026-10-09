import { describe, expect, it } from "vitest";

import { AccountRepository } from "@/db/repositories/account-repository";
import {
  DatabaseConstraintError,
  ImportBatchAlreadyConfirmedError,
  ImportBatchHasUnresolvedDuplicatesError,
  ImportBatchNotConfirmedError,
  ImportBatchNotFoundError,
  ImportBatchUndoBlockedError
} from "@/db/errors";
import { BalanceSnapshotRepository } from "@/db/repositories/balance-snapshot-repository";
import { EmptyImportBatchError, ImportBatchClosingBalanceError } from "@/domain/import-batch";
import { ImportBatchRepository } from "@/db/repositories/import-batch-repository";
import { InstitutionRepository } from "@/db/repositories/institution-repository";
import { InvalidCalendarDateError } from "@/domain/calendar-date";
import { InvalidMinorUnitsError } from "@/domain/money";
import { ReconciliationRepository } from "@/db/repositories/reconciliation-repository";
import { TransactionRepository } from "@/db/repositories/transaction-repository";
import { createTestDb } from "@/db/repositories/test-db";

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

describe("ImportBatchRepository", () => {
  it("rejects a batch referencing an unknown account, writing nothing", async () => {
    const testDb = createTestDb();

    const repository = new ImportBatchRepository(testDb.db);

    await expect(
      repository.create(
        {
          id: "batch-1",
          accountId: "missing-account",
          source: "statement.pdf",
          createdAt: "2026-02-01T00:00:00.000Z",
          closingBalance: null,
          asOfDate: null
        },
        [
          {
            id: "txn-1",
            amount: "-1500.00",
            occurredAt: "2026-01-15",
            description: "Grocery run",
            category: null
          }
        ]
      )
    ).rejects.toBeInstanceOf(DatabaseConstraintError);

    expect(await repository.listAll()).toEqual([]);
    expect(await new TransactionRepository(testDb.db).listByAccountId("missing-account")).toEqual([]);
  });

  it("rejects an unsafe line item amount, writing nothing", async () => {
    const testDb = createTestDb();
    await seedAccount(testDb);

    const repository = new ImportBatchRepository(testDb.db);

    await expect(
      repository.create(
        {
          id: "batch-1",
          accountId: "acc-1",
          source: "statement.pdf",
          createdAt: "2026-02-01T00:00:00.000Z",
          closingBalance: null,
          asOfDate: null
        },
        [
          {
            id: "txn-1",
            amount: "999999999999999999.00",
            occurredAt: "2026-01-15",
            description: "Grocery run",
            category: null
          }
        ]
      )
    ).rejects.toBeInstanceOf(InvalidMinorUnitsError);

    expect(await repository.listAll()).toEqual([]);
    expect(await new TransactionRepository(testDb.db).listByAccountId("acc-1")).toEqual([]);
  });

  it("rejects a batch with an invalid as-of date, writing nothing", async () => {
    const testDb = createTestDb();
    await seedAccount(testDb);

    const repository = new ImportBatchRepository(testDb.db);

    await expect(
      repository.create(
        {
          id: "batch-1",
          accountId: "acc-1",
          source: "statement.pdf",
          createdAt: "2026-02-01T00:00:00.000Z",
          closingBalance: "50000.00",
          asOfDate: "not-a-date"
        },
        [
          {
            id: "txn-1",
            amount: "-1500.00",
            occurredAt: "2026-01-15",
            description: "Grocery run",
            category: null
          }
        ]
      )
    ).rejects.toBeInstanceOf(InvalidCalendarDateError);

    expect(await repository.listAll()).toEqual([]);
  });

  it("rejects a closing balance without its as-of date, and vice versa, writing nothing", async () => {
    const testDb = createTestDb();
    await seedAccount(testDb);

    const repository = new ImportBatchRepository(testDb.db);
    const lineItems = [
      {
        id: "txn-1",
        amount: "-1500.00",
        occurredAt: "2026-01-15",
        description: "Grocery run",
        category: null
      }
    ];

    await expect(
      repository.create(
        {
          id: "batch-1",
          accountId: "acc-1",
          source: "statement.pdf",
          createdAt: "2026-02-01T00:00:00.000Z",
          closingBalance: "50000.00",
          asOfDate: null
        },
        lineItems
      )
    ).rejects.toBeInstanceOf(ImportBatchClosingBalanceError);

    await expect(
      repository.create(
        {
          id: "batch-2",
          accountId: "acc-1",
          source: "statement.pdf",
          createdAt: "2026-02-01T00:00:00.000Z",
          closingBalance: null,
          asOfDate: "2026-01-31"
        },
        lineItems
      )
    ).rejects.toBeInstanceOf(ImportBatchClosingBalanceError);

    expect(await repository.listAll()).toEqual([]);
  });

  it("rejects an empty batch, writing nothing", async () => {
    const testDb = createTestDb();
    await seedAccount(testDb);

    const repository = new ImportBatchRepository(testDb.db);

    await expect(
      repository.create(
        {
          id: "batch-1",
          accountId: "acc-1",
          source: "statement.pdf",
          createdAt: "2026-02-01T00:00:00.000Z",
          closingBalance: null,
          asOfDate: null
        },
        []
      )
    ).rejects.toBeInstanceOf(EmptyImportBatchError);

    expect(await repository.listAll()).toEqual([]);
  });

  it("rolls back the whole batch when two line items share an id", async () => {
    const testDb = createTestDb();
    await seedAccount(testDb);

    const repository = new ImportBatchRepository(testDb.db);

    await expect(
      repository.create(
        {
          id: "batch-1",
          accountId: "acc-1",
          source: "statement.pdf",
          createdAt: "2026-02-01T00:00:00.000Z",
          closingBalance: null,
          asOfDate: null
        },
        [
          {
            id: "txn-1",
            amount: "-1500.00",
            occurredAt: "2026-01-15",
            description: "Grocery run",
            category: null
          },
          {
            id: "txn-1",
            amount: "500.00",
            occurredAt: "2026-01-16",
            description: "Duplicate id",
            category: null
          }
        ]
      )
    ).rejects.toBeInstanceOf(DatabaseConstraintError);

    expect(await repository.listAll()).toEqual([]);
    expect(await new TransactionRepository(testDb.db).listByAccountId("acc-1")).toEqual([]);
  });

  it("creates a batch and its Imported Transactions, normalizing line item dates to midnight UTC, without a BalanceSnapshot or Reconciliation", async () => {
    const testDb = createTestDb();
    await seedAccount(testDb);

    const repository = new ImportBatchRepository(testDb.db);

    const batch = await repository.create(
      {
        id: "batch-1",
        accountId: "acc-1",
        source: "statement.pdf",
        createdAt: "2026-02-01T00:00:00.000Z",
        closingBalance: "50000.00",
        asOfDate: "2026-01-31"
      },
      [
        {
          id: "txn-1",
          amount: "-1500.00",
          occurredAt: "2026-01-15",
          description: "Grocery run",
          category: "Grocery"
        },
        {
          id: "txn-2",
          amount: "60000.00",
          occurredAt: "2026-01-01",
          description: "Salary",
          category: "Salary"
        }
      ]
    );

    expect(batch).toEqual({
      id: "batch-1",
      accountId: "acc-1",
      source: "statement.pdf",
      createdAt: "2026-02-01T00:00:00.000Z",
      closingBalanceMinor: 50_000_00,
      asOfDate: "2026-01-31",
      confirmedAt: null,
      balanceSnapshotId: null,
      reconciliationId: null
    });

    const accountTransactions = await new TransactionRepository(testDb.db).listByAccountId("acc-1");
    expect(accountTransactions).toEqual([
      {
        id: "txn-2",
        accountId: "acc-1",
        amountMinor: 60_000_00,
        occurredAt: "2026-01-01T00:00:00.000Z",
        description: "Salary",
        trustStatus: "Imported",
        transferId: null,
        category: "Salary",
        importBatchId: "batch-1",
        externalRef: null,
        possibleDuplicateOfTransactionId: null
      },
      {
        id: "txn-1",
        accountId: "acc-1",
        amountMinor: -1_500_00,
        occurredAt: "2026-01-15T00:00:00.000Z",
        description: "Grocery run",
        trustStatus: "Imported",
        transferId: null,
        category: "Grocery",
        importBatchId: "batch-1",
        externalRef: null,
        possibleDuplicateOfTransactionId: null
      }
    ]);
  });

  describe("Suspected Duplicate flagging", () => {
    it("sets possibleDuplicateOfTransactionId on a line item matching an existing Transaction's date and amount", async () => {
      const testDb = createTestDb();
      await seedAccount(testDb);
      const transactionRepository = new TransactionRepository(testDb.db);
      await transactionRepository.create({
        id: "existing-txn",
        accountId: "acc-1",
        amountMinor: -1_500_00,
        occurredAt: "2026-01-15T00:00:00.000Z",
        description: "Grocery run",
        trustStatus: "Confirmed",
        transferId: null,
        category: "Grocery",
        importBatchId: null
      });

      const repository = new ImportBatchRepository(testDb.db);

      await repository.create(
        {
          id: "batch-1",
          accountId: "acc-1",
          source: "statement.pdf",
          createdAt: "2026-02-01T00:00:00.000Z",
          closingBalance: null,
          asOfDate: null
        },
        [
          {
            id: "txn-1",
            amount: "-1500.00",
            occurredAt: "2026-01-15",
            description: "Grocery run [REF123]",
            category: "Grocery"
          }
        ]
      );

      const created = await transactionRepository.getById("txn-1");
      expect(created?.possibleDuplicateOfTransactionId).toBe("existing-txn");
    });

    it("leaves possibleDuplicateOfTransactionId null when no existing Transaction matches", async () => {
      const testDb = createTestDb();
      await seedAccount(testDb);

      const repository = new ImportBatchRepository(testDb.db);

      await repository.create(
        {
          id: "batch-1",
          accountId: "acc-1",
          source: "statement.pdf",
          createdAt: "2026-02-01T00:00:00.000Z",
          closingBalance: null,
          asOfDate: null
        },
        [
          {
            id: "txn-1",
            amount: "-1500.00",
            occurredAt: "2026-01-15",
            description: "Grocery run",
            category: "Grocery"
          }
        ]
      );

      const created = await new TransactionRepository(testDb.db).getById("txn-1");
      expect(created?.possibleDuplicateOfTransactionId).toBeNull();
    });

    it("flags a line item repeating an earlier line item in the same batch, leaving the first occurrence unflagged", async () => {
      const testDb = createTestDb();
      await seedAccount(testDb);

      const repository = new ImportBatchRepository(testDb.db);

      await repository.create(
        {
          id: "batch-1",
          accountId: "acc-1",
          source: "statement.pdf",
          createdAt: "2026-02-01T00:00:00.000Z",
          closingBalance: null,
          asOfDate: null
        },
        [
          {
            id: "txn-1",
            amount: "-1500.00",
            occurredAt: "2026-01-15",
            description: "Grocery run",
            category: "Grocery"
          },
          {
            id: "txn-2",
            amount: "-1500.00",
            occurredAt: "2026-01-15",
            description: "Grocery run",
            category: "Grocery"
          }
        ]
      );

      const transactionRepository = new TransactionRepository(testDb.db);
      expect((await transactionRepository.getById("txn-1"))?.possibleDuplicateOfTransactionId).toBeNull();
      expect((await transactionRepository.getById("txn-2"))?.possibleDuplicateOfTransactionId).toBe("txn-1");
    });

    it("flags a line item against the earliest of several matching existing Transactions", async () => {
      const testDb = createTestDb();
      await seedAccount(testDb);
      const transactionRepository = new TransactionRepository(testDb.db);
      await new ImportBatchRepository(testDb.db).create(
        {
          id: "batch-original",
          accountId: "acc-1",
          source: "statement.pdf",
          createdAt: "2026-01-01T00:00:00.000Z",
          closingBalance: null,
          asOfDate: null
        },
        [
          {
            id: "original-txn",
            amount: "-1500.00",
            occurredAt: "2026-01-15",
            description: "Grocery run",
            category: "Grocery"
          }
        ]
      );
      await new ImportBatchRepository(testDb.db).create(
        {
          id: "batch-second",
          accountId: "acc-1",
          source: "statement.pdf",
          createdAt: "2026-01-10T00:00:00.000Z",
          closingBalance: null,
          asOfDate: null
        },
        [
          {
            id: "second-txn",
            amount: "-1500.00",
            occurredAt: "2026-01-15",
            description: "Grocery run",
            category: "Grocery"
          }
        ]
      );

      await new ImportBatchRepository(testDb.db).create(
        {
          id: "batch-third",
          accountId: "acc-1",
          source: "statement.pdf",
          createdAt: "2026-01-20T00:00:00.000Z",
          closingBalance: null,
          asOfDate: null
        },
        [
          {
            id: "third-txn",
            amount: "-1500.00",
            occurredAt: "2026-01-15",
            description: "Grocery run",
            category: "Grocery"
          }
        ]
      );

      const third = await transactionRepository.getById("third-txn");
      expect(third?.possibleDuplicateOfTransactionId).toBe("original-txn");
    });

    it("prefers a match by externalRef over date+amount, matching even when the date differs", async () => {
      const testDb = createTestDb();
      await seedAccount(testDb);
      const transactionRepository = new TransactionRepository(testDb.db);
      await transactionRepository.create({
        id: "existing-txn",
        accountId: "acc-1",
        amountMinor: -1_500_00,
        occurredAt: "2026-01-15T00:00:00.000Z",
        description: "Grocery run",
        trustStatus: "Confirmed",
        transferId: null,
        category: "Grocery",
        importBatchId: null,
        externalRef: "REF123"
      });

      const repository = new ImportBatchRepository(testDb.db);
      await repository.create(
        {
          id: "batch-1",
          accountId: "acc-1",
          source: "statement.pdf",
          createdAt: "2026-02-01T00:00:00.000Z",
          closingBalance: null,
          asOfDate: null
        },
        [
          {
            id: "txn-1",
            amount: "-1500.00",
            occurredAt: "2026-01-20",
            description: "Grocery run (restated)",
            category: "Grocery",
            externalRef: "REF123"
          }
        ]
      );

      const created = await transactionRepository.getById("txn-1");
      expect(created?.possibleDuplicateOfTransactionId).toBe("existing-txn");
    });

    it("falls back to date+amount when externalRef is present but matches no existing Transaction", async () => {
      const testDb = createTestDb();
      await seedAccount(testDb);
      const transactionRepository = new TransactionRepository(testDb.db);
      await transactionRepository.create({
        id: "existing-txn",
        accountId: "acc-1",
        amountMinor: -1_500_00,
        occurredAt: "2026-01-15T00:00:00.000Z",
        description: "Grocery run",
        trustStatus: "Confirmed",
        transferId: null,
        category: "Grocery",
        importBatchId: null
      });

      const repository = new ImportBatchRepository(testDb.db);
      await repository.create(
        {
          id: "batch-1",
          accountId: "acc-1",
          source: "statement.pdf",
          createdAt: "2026-02-01T00:00:00.000Z",
          closingBalance: null,
          asOfDate: null
        },
        [
          {
            id: "txn-1",
            amount: "-1500.00",
            occurredAt: "2026-01-15",
            description: "Grocery run",
            category: "Grocery",
            externalRef: "REF999"
          }
        ]
      );

      const created = await transactionRepository.getById("txn-1");
      expect(created?.possibleDuplicateOfTransactionId).toBe("existing-txn");
    });
  });

  describe("listAll", () => {
    it("orders batches most recent first", async () => {
      const testDb = createTestDb();
      await seedAccount(testDb);
      const repository = new ImportBatchRepository(testDb.db);
      const lineItems = [
        { id: "txn-1", amount: "-1.00", occurredAt: "2026-01-15", description: "x", category: null }
      ];

      await repository.create(
        { id: "batch-older", accountId: "acc-1", source: "a.pdf", createdAt: "2026-01-01T00:00:00.000Z", closingBalance: null, asOfDate: null },
        lineItems
      );
      await repository.create(
        { id: "batch-newer", accountId: "acc-1", source: "b.pdf", createdAt: "2026-02-01T00:00:00.000Z", closingBalance: null, asOfDate: null },
        [{ ...lineItems[0]!, id: "txn-2" }]
      );

      expect((await repository.listAll()).map((batch) => batch.id)).toEqual(["batch-newer", "batch-older"]);
    });
  });

  describe("confirmAll", () => {
    it("throws ImportBatchHasUnresolvedDuplicatesError when a batch Transaction still carries a Suspected Duplicate flag", async () => {
      const testDb = createTestDb();
      await seedAccount(testDb);
      const transactionRepository = new TransactionRepository(testDb.db);
      await transactionRepository.create({
        id: "existing-txn",
        accountId: "acc-1",
        amountMinor: -1_500_00,
        occurredAt: "2026-01-15T00:00:00.000Z",
        description: "Grocery run",
        trustStatus: "Confirmed",
        transferId: null,
        category: "Grocery",
        importBatchId: null
      });
      const repository = new ImportBatchRepository(testDb.db);
      await repository.create(
        {
          id: "batch-1",
          accountId: "acc-1",
          source: "statement.pdf",
          createdAt: "2026-02-01T00:00:00.000Z",
          closingBalance: null,
          asOfDate: null
        },
        [
          {
            id: "txn-1",
            amount: "-1500.00",
            occurredAt: "2026-01-15",
            description: "Grocery run",
            category: "Grocery"
          }
        ]
      );

      await expect(repository.confirmAll("batch-1")).rejects.toBeInstanceOf(
        ImportBatchHasUnresolvedDuplicatesError
      );

      const batch = await repository.getById("batch-1");
      expect(batch?.confirmedAt).toBeNull();
      const transaction = await transactionRepository.getById("txn-1");
      expect(transaction?.trustStatus).toBe("Imported");
    });

    it("flips every batch Transaction to Confirmed and creates no BalanceSnapshot/Reconciliation without a stashed closing balance", async () => {
      const testDb = createTestDb();
      await seedAccount(testDb);
      const repository = new ImportBatchRepository(testDb.db);

      await repository.create(
        {
          id: "batch-1",
          accountId: "acc-1",
          source: "statement.pdf",
          createdAt: "2026-02-01T00:00:00.000Z",
          closingBalance: null,
          asOfDate: null
        },
        [
          {
            id: "txn-1",
            amount: "-1500.00",
            occurredAt: "2026-01-15",
            description: "Grocery run",
            category: "Grocery"
          }
        ]
      );

      const confirmed = await repository.confirmAll("batch-1");

      expect(confirmed.confirmedAt).not.toBeNull();
      expect(confirmed.balanceSnapshotId).toBeNull();
      expect(confirmed.reconciliationId).toBeNull();

      const [transaction] = await new TransactionRepository(testDb.db).listByAccountId("acc-1");
      expect(transaction?.trustStatus).toBe("Confirmed");

      expect(await new ReconciliationRepository(testDb.db).listByAccountId("acc-1")).toEqual([]);
    });

    it("creates a BalanceSnapshot and Reconciliation from the stashed closing balance, recording their ids on the batch", async () => {
      const testDb = createTestDb();
      await seedAccount(testDb);
      const repository = new ImportBatchRepository(testDb.db);

      await repository.create(
        {
          id: "batch-1",
          accountId: "acc-1",
          source: "statement.pdf",
          createdAt: "2026-02-01T00:00:00.000Z",
          closingBalance: "60000.00",
          asOfDate: "2026-01-31"
        },
        [
          {
            id: "txn-1",
            amount: "60000.00",
            occurredAt: "2026-01-01",
            description: "Salary",
            category: "Salary"
          }
        ]
      );

      const confirmed = await repository.confirmAll("batch-1");

      expect(confirmed.balanceSnapshotId).not.toBeNull();
      expect(confirmed.reconciliationId).not.toBeNull();

      const reconciliationRepository = new ReconciliationRepository(testDb.db);
      const [reconciliation] = await reconciliationRepository.listByAccountId("acc-1");
      expect(reconciliation).toEqual({
        id: confirmed.reconciliationId,
        accountId: "acc-1",
        balanceSnapshotId: confirmed.balanceSnapshotId,
        computedBalanceMinor: 60_000_00,
        reconciledAt: confirmed.confirmedAt
      });
      expect(
        await reconciliationRepository.getDiscrepancyByReconciliationId(confirmed.reconciliationId!)
      ).toBeNull();
    });

    it("creates a Discrepancy when the stashed closing balance disagrees with the computed balance", async () => {
      const testDb = createTestDb();
      await seedAccount(testDb);
      const repository = new ImportBatchRepository(testDb.db);

      await repository.create(
        {
          id: "batch-1",
          accountId: "acc-1",
          source: "statement.pdf",
          createdAt: "2026-02-01T00:00:00.000Z",
          closingBalance: "60000.00",
          asOfDate: "2026-01-31"
        },
        [
          {
            id: "txn-1",
            amount: "50000.00",
            occurredAt: "2026-01-01",
            description: "Salary",
            category: "Salary"
          }
        ]
      );

      const confirmed = await repository.confirmAll("batch-1");
      const reconciliationRepository = new ReconciliationRepository(testDb.db);
      const discrepancy = await reconciliationRepository.getDiscrepancyByReconciliationId(
        confirmed.reconciliationId!
      );

      expect(discrepancy).toEqual({
        id: `${confirmed.reconciliationId}-discrepancy`,
        reconciliationId: confirmed.reconciliationId,
        amountMinor: 10_000_00,
        resolution: null
      });
    });

    it("throws on an already-confirmed batch, without side effects", async () => {
      const testDb = createTestDb();
      await seedAccount(testDb);
      const repository = new ImportBatchRepository(testDb.db);

      await repository.create(
        {
          id: "batch-1",
          accountId: "acc-1",
          source: "statement.pdf",
          createdAt: "2026-02-01T00:00:00.000Z",
          closingBalance: null,
          asOfDate: null
        },
        [
          {
            id: "txn-1",
            amount: "-1500.00",
            occurredAt: "2026-01-15",
            description: "Grocery run",
            category: "Grocery"
          }
        ]
      );
      const confirmedOnce = await repository.confirmAll("batch-1");

      await expect(repository.confirmAll("batch-1")).rejects.toBeInstanceOf(
        ImportBatchAlreadyConfirmedError
      );

      const confirmedAgain = await repository.getById("batch-1");
      expect(confirmedAgain).toEqual(confirmedOnce);
    });

    it("throws on an unknown batch id", async () => {
      const testDb = createTestDb();

      const repository = new ImportBatchRepository(testDb.db);

      await expect(repository.confirmAll("missing-batch")).rejects.toBeInstanceOf(
        ImportBatchNotFoundError
      );
    });

    it("two concurrent confirmAll calls (a double-click before the button disables) do not both succeed in creating a BalanceSnapshot/Reconciliation", async () => {
      const testDb = createTestDb();
      await seedAccount(testDb);
      const repository = new ImportBatchRepository(testDb.db);

      await repository.create(
        {
          id: "batch-1",
          accountId: "acc-1",
          source: "statement.pdf",
          createdAt: "2026-02-01T00:00:00.000Z",
          closingBalance: "60000.00",
          asOfDate: "2026-01-31"
        },
        [
          {
            id: "txn-1",
            amount: "60000.00",
            occurredAt: "2026-01-01",
            description: "Salary",
            category: "Salary"
          }
        ]
      );

      // Both calls read confirmedAt === null before either writes back — the same race a
      // double-click (or a back-button resubmit) can trigger against a real server, since
      // confirmAll is deliberately not one atomic transaction (see class doc comment).
      const results = await Promise.allSettled([
        repository.confirmAll("batch-1"),
        repository.confirmAll("batch-1")
      ]);

      const rejected = results.filter((result) => result.status === "rejected");
      // Whichever way this resolves, it must be a recognizable, catchable error — never an
      // uncaught raw constraint violation from a duplicate deterministic snapshot/reconciliation
      // id — and the batch must end up in a single consistent confirmed state.
      for (const failure of rejected) {
        if (failure.status === "rejected") {
          expect(failure.reason).toBeInstanceOf(ImportBatchAlreadyConfirmedError);
        }
      }
      const finalBatch = await repository.getById("batch-1");
      expect(finalBatch?.confirmedAt).not.toBeNull();
      const reconciliations = await new ReconciliationRepository(testDb.db).listByAccountId("acc-1");
      expect(reconciliations).toHaveLength(1);
    });
  });

  describe("delete", () => {
    it("removes an unconfirmed batch's Transactions and the batch row, and nothing else", async () => {
      const testDb = createTestDb();
      await seedAccount(testDb);
      const repository = new ImportBatchRepository(testDb.db);

      await new TransactionRepository(testDb.db).create({
        id: "unrelated-txn",
        accountId: "acc-1",
        amountMinor: 1_00,
        occurredAt: "2026-01-01T00:00:00.000Z",
        description: "Unrelated",
        trustStatus: "Confirmed",
        transferId: null,
        category: null,
        importBatchId: null
      });

      await repository.create(
        {
          id: "batch-1",
          accountId: "acc-1",
          source: "statement.pdf",
          createdAt: "2026-02-01T00:00:00.000Z",
          closingBalance: null,
          asOfDate: null
        },
        [
          {
            id: "txn-1",
            amount: "-1500.00",
            occurredAt: "2026-01-15",
            description: "Grocery run",
            category: "Grocery"
          }
        ]
      );

      await repository.delete("batch-1");

      expect(await repository.getById("batch-1")).toBeNull();
      const remaining = await new TransactionRepository(testDb.db).listByAccountId("acc-1");
      expect(remaining.map((transaction) => transaction.id)).toEqual(["unrelated-txn"]);
    });

    it("throws on an already-confirmed batch, without side effects", async () => {
      const testDb = createTestDb();
      await seedAccount(testDb);
      const repository = new ImportBatchRepository(testDb.db);

      await repository.create(
        {
          id: "batch-1",
          accountId: "acc-1",
          source: "statement.pdf",
          createdAt: "2026-02-01T00:00:00.000Z",
          closingBalance: null,
          asOfDate: null
        },
        [
          {
            id: "txn-1",
            amount: "-1500.00",
            occurredAt: "2026-01-15",
            description: "Grocery run",
            category: "Grocery"
          }
        ]
      );
      await repository.confirmAll("batch-1");

      await expect(repository.delete("batch-1")).rejects.toBeInstanceOf(
        ImportBatchAlreadyConfirmedError
      );

      expect(await repository.getById("batch-1")).not.toBeNull();
      expect(await new TransactionRepository(testDb.db).listByAccountId("acc-1")).toHaveLength(1);
    });

    it("no-ops on an unknown batch id", async () => {
      const testDb = createTestDb();

      const repository = new ImportBatchRepository(testDb.db);

      await expect(repository.delete("missing-batch")).resolves.toBeUndefined();
    });
  });

  describe("undoConfirmed", () => {
    it("removes a confirmed batch's Transactions, BalanceSnapshot, Reconciliation, and the batch row", async () => {
      const testDb = createTestDb();
      await seedAccount(testDb);
      const repository = new ImportBatchRepository(testDb.db);

      await repository.create(
        {
          id: "batch-1",
          accountId: "acc-1",
          source: "statement.pdf",
          createdAt: "2026-02-01T00:00:00.000Z",
          closingBalance: "60000.00",
          asOfDate: "2026-01-31"
        },
        [
          {
            id: "txn-1",
            amount: "60000.00",
            occurredAt: "2026-01-01",
            description: "Salary",
            category: "Salary"
          }
        ]
      );
      const confirmed = await repository.confirmAll("batch-1");

      await repository.undoConfirmed("batch-1");

      expect(await repository.getById("batch-1")).toBeNull();
      expect(await new TransactionRepository(testDb.db).listByAccountId("acc-1")).toEqual([]);
      const reconciliationRepository = new ReconciliationRepository(testDb.db);
      expect(await reconciliationRepository.getById(confirmed.reconciliationId!)).toBeNull();
      expect(
        await new BalanceSnapshotRepository(testDb.db).getById(confirmed.balanceSnapshotId!)
      ).toBeNull();
    });

    it("removes just the Transactions and batch row when confirmAll created no BalanceSnapshot/Reconciliation", async () => {
      const testDb = createTestDb();
      await seedAccount(testDb);
      const repository = new ImportBatchRepository(testDb.db);

      await repository.create(
        {
          id: "batch-1",
          accountId: "acc-1",
          source: "statement.pdf",
          createdAt: "2026-02-01T00:00:00.000Z",
          closingBalance: null,
          asOfDate: null
        },
        [
          {
            id: "txn-1",
            amount: "-1500.00",
            occurredAt: "2026-01-15",
            description: "Grocery run",
            category: "Grocery"
          }
        ]
      );
      await repository.confirmAll("batch-1");

      await repository.undoConfirmed("batch-1");

      expect(await repository.getById("batch-1")).toBeNull();
      expect(await new TransactionRepository(testDb.db).listByAccountId("acc-1")).toEqual([]);
    });

    it("throws on a batch that has not been confirmed yet", async () => {
      const testDb = createTestDb();
      await seedAccount(testDb);
      const repository = new ImportBatchRepository(testDb.db);

      await repository.create(
        {
          id: "batch-1",
          accountId: "acc-1",
          source: "statement.pdf",
          createdAt: "2026-02-01T00:00:00.000Z",
          closingBalance: null,
          asOfDate: null
        },
        [
          {
            id: "txn-1",
            amount: "-1500.00",
            occurredAt: "2026-01-15",
            description: "Grocery run",
            category: "Grocery"
          }
        ]
      );

      await expect(repository.undoConfirmed("batch-1")).rejects.toBeInstanceOf(
        ImportBatchNotConfirmedError
      );
      expect(await repository.getById("batch-1")).not.toBeNull();
    });

    it("throws on an unknown batch id", async () => {
      const testDb = createTestDb();

      const repository = new ImportBatchRepository(testDb.db);

      await expect(repository.undoConfirmed("missing-batch")).rejects.toBeInstanceOf(
        ImportBatchNotFoundError
      );
    });

    it("throws when the batch's Reconciliation has a Discrepancy with an Adjustment", async () => {
      const testDb = createTestDb();
      await seedAccount(testDb);
      const repository = new ImportBatchRepository(testDb.db);

      await repository.create(
        {
          id: "batch-1",
          accountId: "acc-1",
          source: "statement.pdf",
          createdAt: "2026-02-01T00:00:00.000Z",
          closingBalance: "60000.00",
          asOfDate: "2026-01-31"
        },
        [
          {
            id: "txn-1",
            amount: "50000.00",
            occurredAt: "2026-01-01",
            description: "Salary",
            category: "Salary"
          }
        ]
      );
      const confirmed = await repository.confirmAll("batch-1");
      const reconciliationRepository = new ReconciliationRepository(testDb.db);
      await reconciliationRepository.resolveWithAdjustment(`${confirmed.reconciliationId}-discrepancy`, {
        id: "adj-txn-1",
        accountId: "acc-1",
        amountMinor: 10_000_00,
        occurredAt: "2026-02-01T00:00:00.000Z",
        description: "Adjustment"
      });

      await expect(repository.undoConfirmed("batch-1")).rejects.toBeInstanceOf(
        ImportBatchUndoBlockedError
      );
      expect(await repository.getById("batch-1")).not.toBeNull();
    });

    it("throws when a later Reconciliation exists for the same Account", async () => {
      const testDb = createTestDb();
      await seedAccount(testDb);
      const repository = new ImportBatchRepository(testDb.db);

      await repository.create(
        {
          id: "batch-1",
          accountId: "acc-1",
          source: "statement.pdf",
          createdAt: "2026-02-01T00:00:00.000Z",
          closingBalance: "60000.00",
          asOfDate: "2026-01-31"
        },
        [
          {
            id: "txn-1",
            amount: "60000.00",
            occurredAt: "2026-01-01",
            description: "Salary",
            category: "Salary"
          }
        ]
      );
      await repository.confirmAll("batch-1");

      await new BalanceSnapshotRepository(testDb.db).create({
        id: "snap-later",
        accountId: "acc-1",
        asOfDate: "2026-02-28",
        balanceMinor: 60_000_00
      });
      await new ReconciliationRepository(testDb.db).create({
        id: "recon-later",
        accountId: "acc-1",
        balanceSnapshotId: "snap-later",
        reconciledAt: "2026-03-01T00:00:00.000Z"
      });

      await expect(repository.undoConfirmed("batch-1")).rejects.toBeInstanceOf(
        ImportBatchUndoBlockedError
      );
      expect(await repository.getById("batch-1")).not.toBeNull();
    });
  });
});
