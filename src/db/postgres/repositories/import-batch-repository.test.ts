import { randomUUID } from "node:crypto";

import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";

import {
  DatabaseConstraintError,
  ImportBatchAlreadyConfirmedError,
  ImportBatchHasUnresolvedDuplicatesError,
  ImportBatchNotConfirmedError,
  ImportBatchNotFoundError,
  ImportBatchUndoBlockedError
} from "@/db/errors";
import { PgAccountRepository } from "@/db/postgres/repositories/account-repository";
import { PgBalanceSnapshotRepository } from "@/db/postgres/repositories/balance-snapshot-repository";
import { PgImportBatchRepository } from "@/db/postgres/repositories/import-batch-repository";
import { PgInstitutionRepository } from "@/db/postgres/repositories/institution-repository";
import { PgReconciliationRepository } from "@/db/postgres/repositories/reconciliation-repository";
import { PgTransactionRepository } from "@/db/postgres/repositories/transaction-repository";
import { EmptyImportBatchError } from "@/domain/import-batch";

const CONNECTION_STRING =
  process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

const admin = postgres(CONNECTION_STRING, { max: 1 });

afterAll(async () => {
  await admin.end();
});

async function seedOwnerWithAccount(ownerId: string) {
  const institution = { id: randomUUID(), name: "Bank" };
  const account = {
    id: randomUUID(),
    institutionId: institution.id,
    name: "Checking",
    accountNumber: null,
    currencyCode: "USD"
  };

  await new PgInstitutionRepository(CONNECTION_STRING, ownerId).create(institution);
  await new PgAccountRepository(CONNECTION_STRING, ownerId).create(account);

  return { institution, account };
}

describe("PgImportBatchRepository", () => {
  it("creates an unconfirmed batch and its Imported Transactions", async () => {
    const ownerId = randomUUID();
    const { account } = await seedOwnerWithAccount(ownerId);
    const repository = new PgImportBatchRepository(CONNECTION_STRING, ownerId);
    const batchId = randomUUID();
    const transactionId = randomUUID();

    const batch = await repository.create(
      {
        id: batchId,
        accountId: account.id,
        source: "statement.pdf",
        createdAt: "2026-02-01T00:00:00.000Z",
        closingBalance: "500.00",
        asOfDate: "2026-01-31"
      },
      [{ id: transactionId, amount: "-15.00", occurredAt: "2026-01-15", description: "Grocery run", category: null }]
    );

    expect(batch).toEqual({
      id: batchId,
      accountId: account.id,
      source: "statement.pdf",
      createdAt: "2026-02-01T00:00:00.000Z",
      closingBalanceMinor: 500_00,
      asOfDate: "2026-01-31",
      confirmedAt: null,
      balanceSnapshotId: null,
      reconciliationId: null
    });

    const transactions = await new PgTransactionRepository(CONNECTION_STRING, ownerId).listByAccountId(account.id);
    expect(transactions).toEqual([
      expect.objectContaining({
        id: transactionId,
        amountMinor: -15_00,
        trustStatus: "Imported",
        importBatchId: batchId
      })
    ]);
  });

  it("sets possibleDuplicateOfTransactionId on a line item matching an existing Transaction's date and amount", async () => {
    const ownerId = randomUUID();
    const { account } = await seedOwnerWithAccount(ownerId);
    const transactionRepository = new PgTransactionRepository(CONNECTION_STRING, ownerId);
    const existingTransactionId = randomUUID();
    await transactionRepository.create({
      id: existingTransactionId,
      accountId: account.id,
      amountMinor: -15_00,
      occurredAt: "2026-01-15T00:00:00.000Z",
      description: "Grocery run",
      trustStatus: "Confirmed",
      transferId: null,
      category: "Grocery",
      importBatchId: null
    });

    const repository = new PgImportBatchRepository(CONNECTION_STRING, ownerId);
    const newTransactionId = randomUUID();
    await repository.create(
      {
        id: randomUUID(),
        accountId: account.id,
        source: "statement.pdf",
        createdAt: "2026-02-01T00:00:00.000Z",
        closingBalance: null,
        asOfDate: null
      },
      [
        {
          id: newTransactionId,
          amount: "-15.00",
          occurredAt: "2026-01-15",
          description: "Grocery run [REF123]",
          category: "Grocery"
        }
      ]
    );

    const created = await transactionRepository.getById(newTransactionId);
    expect(created?.possibleDuplicateOfTransactionId).toBe(existingTransactionId);
  });

  it("leaves possibleDuplicateOfTransactionId null when no existing Transaction matches", async () => {
    const ownerId = randomUUID();
    const { account } = await seedOwnerWithAccount(ownerId);
    const repository = new PgImportBatchRepository(CONNECTION_STRING, ownerId);
    const transactionId = randomUUID();

    await repository.create(
      {
        id: randomUUID(),
        accountId: account.id,
        source: "statement.pdf",
        createdAt: "2026-02-01T00:00:00.000Z",
        closingBalance: null,
        asOfDate: null
      },
      [{ id: transactionId, amount: "-15.00", occurredAt: "2026-01-15", description: "Grocery run", category: null }]
    );

    const created = await new PgTransactionRepository(CONNECTION_STRING, ownerId).getById(transactionId);
    expect(created?.possibleDuplicateOfTransactionId).toBeNull();
  });

  it("flags a line item repeating an earlier line item in the same batch, leaving the first occurrence unflagged", async () => {
    const ownerId = randomUUID();
    const { account } = await seedOwnerWithAccount(ownerId);
    const repository = new PgImportBatchRepository(CONNECTION_STRING, ownerId);
    const firstId = randomUUID();
    const secondId = randomUUID();

    await repository.create(
      {
        id: randomUUID(),
        accountId: account.id,
        source: "statement.pdf",
        createdAt: "2026-02-01T00:00:00.000Z",
        closingBalance: null,
        asOfDate: null
      },
      [
        { id: firstId, amount: "-15.00", occurredAt: "2026-01-15", description: "Grocery run", category: null },
        { id: secondId, amount: "-15.00", occurredAt: "2026-01-15", description: "Grocery run", category: null }
      ]
    );

    const transactionRepository = new PgTransactionRepository(CONNECTION_STRING, ownerId);
    expect((await transactionRepository.getById(firstId))?.possibleDuplicateOfTransactionId).toBeNull();
    expect((await transactionRepository.getById(secondId))?.possibleDuplicateOfTransactionId).toBe(firstId);
  });

  it("flags a line item against the earliest of several matching existing Transactions", async () => {
    const ownerId = randomUUID();
    const { account } = await seedOwnerWithAccount(ownerId);
    const transactionRepository = new PgTransactionRepository(CONNECTION_STRING, ownerId);
    const originalTxnId = randomUUID();
    const secondTxnId = randomUUID();
    const thirdTxnId = randomUUID();
    const repository = new PgImportBatchRepository(CONNECTION_STRING, ownerId);

    await repository.create(
      {
        id: randomUUID(),
        accountId: account.id,
        source: "statement.pdf",
        createdAt: "2026-01-01T00:00:00.000Z",
        closingBalance: null,
        asOfDate: null
      },
      [{ id: originalTxnId, amount: "-15.00", occurredAt: "2026-01-15", description: "Grocery run", category: null }]
    );
    await repository.create(
      {
        id: randomUUID(),
        accountId: account.id,
        source: "statement.pdf",
        createdAt: "2026-01-10T00:00:00.000Z",
        closingBalance: null,
        asOfDate: null
      },
      [{ id: secondTxnId, amount: "-15.00", occurredAt: "2026-01-15", description: "Grocery run", category: null }]
    );
    await repository.create(
      {
        id: randomUUID(),
        accountId: account.id,
        source: "statement.pdf",
        createdAt: "2026-01-20T00:00:00.000Z",
        closingBalance: null,
        asOfDate: null
      },
      [{ id: thirdTxnId, amount: "-15.00", occurredAt: "2026-01-15", description: "Grocery run", category: null }]
    );

    const third = await transactionRepository.getById(thirdTxnId);
    expect(third?.possibleDuplicateOfTransactionId).toBe(originalTxnId);
  });

  it("prefers a match by externalRef over date+amount, matching even when the date differs", async () => {
    const ownerId = randomUUID();
    const { account } = await seedOwnerWithAccount(ownerId);
    const transactionRepository = new PgTransactionRepository(CONNECTION_STRING, ownerId);
    const existingTransactionId = randomUUID();
    await transactionRepository.create({
      id: existingTransactionId,
      accountId: account.id,
      amountMinor: -15_00,
      occurredAt: "2026-01-15T00:00:00.000Z",
      description: "Grocery run",
      trustStatus: "Confirmed",
      transferId: null,
      category: "Grocery",
      importBatchId: null,
      externalRef: "REF123"
    });

    const repository = new PgImportBatchRepository(CONNECTION_STRING, ownerId);
    const newTransactionId = randomUUID();
    await repository.create(
      {
        id: randomUUID(),
        accountId: account.id,
        source: "statement.pdf",
        createdAt: "2026-02-01T00:00:00.000Z",
        closingBalance: null,
        asOfDate: null
      },
      [
        {
          id: newTransactionId,
          amount: "-15.00",
          occurredAt: "2026-01-20",
          description: "Grocery run (restated)",
          category: "Grocery",
          externalRef: "REF123"
        }
      ]
    );

    const created = await transactionRepository.getById(newTransactionId);
    expect(created?.possibleDuplicateOfTransactionId).toBe(existingTransactionId);
  });

  it("falls back to date+amount when externalRef is present but matches no existing Transaction", async () => {
    const ownerId = randomUUID();
    const { account } = await seedOwnerWithAccount(ownerId);
    const transactionRepository = new PgTransactionRepository(CONNECTION_STRING, ownerId);
    const existingTransactionId = randomUUID();
    await transactionRepository.create({
      id: existingTransactionId,
      accountId: account.id,
      amountMinor: -15_00,
      occurredAt: "2026-01-15T00:00:00.000Z",
      description: "Grocery run",
      trustStatus: "Confirmed",
      transferId: null,
      category: "Grocery",
      importBatchId: null
    });

    const repository = new PgImportBatchRepository(CONNECTION_STRING, ownerId);
    const newTransactionId = randomUUID();
    await repository.create(
      {
        id: randomUUID(),
        accountId: account.id,
        source: "statement.pdf",
        createdAt: "2026-02-01T00:00:00.000Z",
        closingBalance: null,
        asOfDate: null
      },
      [
        {
          id: newTransactionId,
          amount: "-15.00",
          occurredAt: "2026-01-15",
          description: "Grocery run",
          category: "Grocery",
          externalRef: "REF999"
        }
      ]
    );

    const created = await transactionRepository.getById(newTransactionId);
    expect(created?.possibleDuplicateOfTransactionId).toBe(existingTransactionId);
  });

  it("rejects an unknown accountId, writing nothing", async () => {
    const ownerId = randomUUID();
    const repository = new PgImportBatchRepository(CONNECTION_STRING, ownerId);

    await expect(
      repository.create(
        {
          id: randomUUID(),
          accountId: randomUUID(),
          source: "statement.pdf",
          createdAt: "2026-02-01T00:00:00.000Z",
          closingBalance: null,
          asOfDate: null
        },
        [{ id: randomUUID(), amount: "-1.00", occurredAt: "2026-01-15", description: "x", category: null }]
      )
    ).rejects.toBeInstanceOf(DatabaseConstraintError);
  });

  it("rejects an empty line-item list, writing nothing", async () => {
    const ownerId = randomUUID();
    const { account } = await seedOwnerWithAccount(ownerId);
    const repository = new PgImportBatchRepository(CONNECTION_STRING, ownerId);

    await expect(
      repository.create(
        {
          id: randomUUID(),
          accountId: account.id,
          source: "statement.pdf",
          createdAt: "2026-02-01T00:00:00.000Z",
          closingBalance: null,
          asOfDate: null
        },
        []
      )
    ).rejects.toBeInstanceOf(EmptyImportBatchError);
  });

  it("confirmAll throws ImportBatchHasUnresolvedDuplicatesError when a batch Transaction still carries a Suspected Duplicate flag", async () => {
    const ownerId = randomUUID();
    const { account } = await seedOwnerWithAccount(ownerId);
    const transactionRepository = new PgTransactionRepository(CONNECTION_STRING, ownerId);
    await transactionRepository.create({
      id: randomUUID(),
      accountId: account.id,
      amountMinor: -15_00,
      occurredAt: "2026-01-15T00:00:00.000Z",
      description: "Grocery run",
      trustStatus: "Confirmed",
      transferId: null,
      category: "Grocery",
      importBatchId: null
    });
    const repository = new PgImportBatchRepository(CONNECTION_STRING, ownerId);
    const batchId = randomUUID();
    const newTransactionId = randomUUID();

    await repository.create(
      {
        id: batchId,
        accountId: account.id,
        source: "statement.pdf",
        createdAt: "2026-02-01T00:00:00.000Z",
        closingBalance: null,
        asOfDate: null
      },
      [{ id: newTransactionId, amount: "-15.00", occurredAt: "2026-01-15", description: "Grocery run", category: "Grocery" }]
    );

    await expect(repository.confirmAll(batchId)).rejects.toBeInstanceOf(ImportBatchHasUnresolvedDuplicatesError);

    const batch = await repository.getById(batchId);
    expect(batch?.confirmedAt).toBeNull();
    const transaction = await transactionRepository.getById(newTransactionId);
    expect(transaction?.trustStatus).toBe("Imported");
  });

  it("confirmAll flips Transactions to Confirmed and creates a BalanceSnapshot/Reconciliation when a closing balance was stashed", async () => {
    const ownerId = randomUUID();
    const { account } = await seedOwnerWithAccount(ownerId);
    const repository = new PgImportBatchRepository(CONNECTION_STRING, ownerId);
    const batchId = randomUUID();

    const created = await repository.create(
      {
        id: batchId,
        accountId: account.id,
        source: "statement.pdf",
        createdAt: "2026-02-01T00:00:00.000Z",
        closingBalance: "500.00",
        asOfDate: "2026-01-31"
      },
      [{ id: randomUUID(), amount: "-15.00", occurredAt: "2026-01-15", description: "x", category: null }]
    );

    const confirmed = await repository.confirmAll(created.id);

    expect(confirmed.confirmedAt).not.toBeNull();
    expect(confirmed.balanceSnapshotId).not.toBeNull();
    expect(confirmed.reconciliationId).not.toBeNull();

    const transactions = await new PgTransactionRepository(CONNECTION_STRING, ownerId).listByAccountId(account.id);
    expect(transactions[0]?.trustStatus).toBe("Confirmed");
  });

  it("confirmAll on an already-confirmed batch throws without side effects", async () => {
    const ownerId = randomUUID();
    const { account } = await seedOwnerWithAccount(ownerId);
    const repository = new PgImportBatchRepository(CONNECTION_STRING, ownerId);
    const batchId = randomUUID();

    await repository.create(
      {
        id: batchId,
        accountId: account.id,
        source: "statement.pdf",
        createdAt: "2026-02-01T00:00:00.000Z",
        closingBalance: null,
        asOfDate: null
      },
      [{ id: randomUUID(), amount: "-1.00", occurredAt: "2026-01-15", description: "x", category: null }]
    );
    await repository.confirmAll(batchId);

    await expect(repository.confirmAll(batchId)).rejects.toBeInstanceOf(ImportBatchAlreadyConfirmedError);
  });

  it("confirmAll on an unknown id throws", async () => {
    const ownerId = randomUUID();
    const repository = new PgImportBatchRepository(CONNECTION_STRING, ownerId);

    await expect(repository.confirmAll(randomUUID())).rejects.toBeInstanceOf(ImportBatchNotFoundError);
  });

  it("two concurrent confirmAll calls (a double-click before the button disables) do not both succeed in creating a BalanceSnapshot/Reconciliation", async () => {
    const ownerId = randomUUID();
    const { account } = await seedOwnerWithAccount(ownerId);
    const repository = new PgImportBatchRepository(CONNECTION_STRING, ownerId);
    const batchId = randomUUID();

    await repository.create(
      {
        id: batchId,
        accountId: account.id,
        source: "statement.pdf",
        createdAt: "2026-02-01T00:00:00.000Z",
        closingBalance: "600.00",
        asOfDate: "2026-01-31"
      },
      [{ id: randomUUID(), amount: "600.00", occurredAt: "2026-01-01", description: "Salary", category: "Salary" }]
    );

    // Both calls read confirmedAt === null before either writes back — the same race a
    // double-click (or a back-button resubmit) can trigger against a real server, since
    // confirmAll is deliberately not one atomic transaction (see class doc comment).
    const results = await Promise.allSettled([repository.confirmAll(batchId), repository.confirmAll(batchId)]);

    // Whichever way this resolves, it must be a recognizable, catchable error — never an
    // uncaught raw constraint violation from a duplicate deterministic snapshot/reconciliation
    // id — and the batch must end up in a single consistent confirmed state.
    for (const result of results) {
      if (result.status === "rejected") {
        expect(result.reason).toBeInstanceOf(ImportBatchAlreadyConfirmedError);
      }
    }
    const finalBatch = await repository.getById(batchId);
    expect(finalBatch?.confirmedAt).not.toBeNull();

    const reconciliations = await new PgReconciliationRepository(CONNECTION_STRING, ownerId).listByAccountId(
      account.id
    );
    expect(reconciliations).toHaveLength(1);
  });

  it("delete on an unconfirmed batch removes its Transactions and the batch row", async () => {
    const ownerId = randomUUID();
    const { account } = await seedOwnerWithAccount(ownerId);
    const repository = new PgImportBatchRepository(CONNECTION_STRING, ownerId);
    const batchId = randomUUID();

    await repository.create(
      {
        id: batchId,
        accountId: account.id,
        source: "statement.pdf",
        createdAt: "2026-02-01T00:00:00.000Z",
        closingBalance: null,
        asOfDate: null
      },
      [{ id: randomUUID(), amount: "-1.00", occurredAt: "2026-01-15", description: "x", category: null }]
    );

    await repository.delete(batchId);

    expect(await repository.getById(batchId)).toBeNull();
    expect(await new PgTransactionRepository(CONNECTION_STRING, ownerId).listByAccountId(account.id)).toEqual([]);
  });

  it("delete on a batch a processed_email_alerts row still points at nulls that reference instead of failing", async () => {
    // Regression: postgres/migrations/20260911020000_processed_email_alerts.sql declared the FK
    // with no ON DELETE clause, so Postgres defaulted to NO ACTION and this delete failed with a
    // foreign key violation (reproduced live via /imports/:id/delete, 2026-09-14).
    const ownerId = randomUUID();
    const { account } = await seedOwnerWithAccount(ownerId);
    const repository = new PgImportBatchRepository(CONNECTION_STRING, ownerId);
    const batchId = randomUUID();

    await repository.create(
      {
        id: batchId,
        accountId: account.id,
        source: "statement.pdf",
        createdAt: "2026-02-01T00:00:00.000Z",
        closingBalance: null,
        asOfDate: null
      },
      [{ id: randomUUID(), amount: "-1.00", occurredAt: "2026-01-15", description: "x", category: null }]
    );

    const alertId = randomUUID();
    await admin`
      insert into processed_email_alerts
        (id, owner_id, mailbox, message_uid, status, processed_at, import_batch_id)
      values
        (${alertId}, ${ownerId}, 'inbox@example.com', '1:1', 'matched', '2026-02-01T00:00:00.000Z', ${batchId})
    `;

    await repository.delete(batchId);

    expect(await repository.getById(batchId)).toBeNull();
    const [alertRow] = await admin`select import_batch_id from processed_email_alerts where id = ${alertId}`;
    expect(alertRow?.import_batch_id).toBeNull();
  });

  it("delete on an already-confirmed batch throws without side effects", async () => {
    const ownerId = randomUUID();
    const { account } = await seedOwnerWithAccount(ownerId);
    const repository = new PgImportBatchRepository(CONNECTION_STRING, ownerId);
    const batchId = randomUUID();

    await repository.create(
      {
        id: batchId,
        accountId: account.id,
        source: "statement.pdf",
        createdAt: "2026-02-01T00:00:00.000Z",
        closingBalance: null,
        asOfDate: null
      },
      [{ id: randomUUID(), amount: "-1.00", occurredAt: "2026-01-15", description: "x", category: null }]
    );
    await repository.confirmAll(batchId);

    await expect(repository.delete(batchId)).rejects.toBeInstanceOf(ImportBatchAlreadyConfirmedError);
  });

  it("listAll orders batches most recent first", async () => {
    const ownerId = randomUUID();
    const { account } = await seedOwnerWithAccount(ownerId);
    const repository = new PgImportBatchRepository(CONNECTION_STRING, ownerId);

    await repository.create(
      {
        id: randomUUID(),
        accountId: account.id,
        source: "older.pdf",
        createdAt: "2026-01-01T00:00:00.000Z",
        closingBalance: null,
        asOfDate: null
      },
      [{ id: randomUUID(), amount: "-1.00", occurredAt: "2026-01-15", description: "x", category: null }]
    );
    await repository.create(
      {
        id: randomUUID(),
        accountId: account.id,
        source: "newer.pdf",
        createdAt: "2026-02-01T00:00:00.000Z",
        closingBalance: null,
        asOfDate: null
      },
      [{ id: randomUUID(), amount: "-1.00", occurredAt: "2026-01-15", description: "x", category: null }]
    );

    const batches = await repository.listAll();
    expect(batches.map((batch) => batch.source)).toEqual(["newer.pdf", "older.pdf"]);
  });

  // Deliberately verifies isolation catches a missing ownerId predicate, matching the pattern
  // PgTransactionRepository's own test suite already applies.
  it("does not include another Owner's batches in listAll", async () => {
    const ownerA = randomUUID();
    const ownerB = randomUUID();
    const { account } = await seedOwnerWithAccount(ownerA);
    await seedOwnerWithAccount(ownerB);

    await new PgImportBatchRepository(CONNECTION_STRING, ownerA).create(
      {
        id: randomUUID(),
        accountId: account.id,
        source: "a.pdf",
        createdAt: "2026-01-01T00:00:00.000Z",
        closingBalance: null,
        asOfDate: null
      },
      [{ id: randomUUID(), amount: "-1.00", occurredAt: "2026-01-15", description: "x", category: null }]
    );

    expect(await new PgImportBatchRepository(CONNECTION_STRING, ownerB).listAll()).toEqual([]);
  });

  describe("undoConfirmed", () => {
    it("removes a confirmed batch's Transactions, BalanceSnapshot, Reconciliation, and the batch row", async () => {
      const ownerId = randomUUID();
      const { account } = await seedOwnerWithAccount(ownerId);
      const repository = new PgImportBatchRepository(CONNECTION_STRING, ownerId);
      const batchId = randomUUID();

      await repository.create(
        {
          id: batchId,
          accountId: account.id,
          source: "statement.pdf",
          createdAt: "2026-02-01T00:00:00.000Z",
          closingBalance: "60000.00",
          asOfDate: "2026-01-31"
        },
        [{ id: randomUUID(), amount: "60000.00", occurredAt: "2026-01-01", description: "Salary", category: null }]
      );
      const confirmed = await repository.confirmAll(batchId);

      await repository.undoConfirmed(batchId);

      expect(await repository.getById(batchId)).toBeNull();
      expect(await new PgTransactionRepository(CONNECTION_STRING, ownerId).listByAccountId(account.id)).toEqual([]);
      const reconciliationRepository = new PgReconciliationRepository(CONNECTION_STRING, ownerId);
      expect(await reconciliationRepository.getById(confirmed.reconciliationId!)).toBeNull();
      expect(
        await new PgBalanceSnapshotRepository(CONNECTION_STRING, ownerId).getById(confirmed.balanceSnapshotId!)
      ).toBeNull();
    });

    it("removes just the Transactions and batch row when confirmAll created no BalanceSnapshot/Reconciliation", async () => {
      const ownerId = randomUUID();
      const { account } = await seedOwnerWithAccount(ownerId);
      const repository = new PgImportBatchRepository(CONNECTION_STRING, ownerId);
      const batchId = randomUUID();

      await repository.create(
        {
          id: batchId,
          accountId: account.id,
          source: "statement.pdf",
          createdAt: "2026-02-01T00:00:00.000Z",
          closingBalance: null,
          asOfDate: null
        },
        [{ id: randomUUID(), amount: "-1500.00", occurredAt: "2026-01-15", description: "Grocery run", category: null }]
      );
      await repository.confirmAll(batchId);

      await repository.undoConfirmed(batchId);

      expect(await repository.getById(batchId)).toBeNull();
      expect(await new PgTransactionRepository(CONNECTION_STRING, ownerId).listByAccountId(account.id)).toEqual([]);
    });

    it("throws on a batch that has not been confirmed yet", async () => {
      const ownerId = randomUUID();
      const { account } = await seedOwnerWithAccount(ownerId);
      const repository = new PgImportBatchRepository(CONNECTION_STRING, ownerId);
      const batchId = randomUUID();

      await repository.create(
        {
          id: batchId,
          accountId: account.id,
          source: "statement.pdf",
          createdAt: "2026-02-01T00:00:00.000Z",
          closingBalance: null,
          asOfDate: null
        },
        [{ id: randomUUID(), amount: "-1500.00", occurredAt: "2026-01-15", description: "Grocery run", category: null }]
      );

      await expect(repository.undoConfirmed(batchId)).rejects.toBeInstanceOf(ImportBatchNotConfirmedError);
      expect(await repository.getById(batchId)).not.toBeNull();
    });

    it("throws on an unknown batch id", async () => {
      const ownerId = randomUUID();
      const repository = new PgImportBatchRepository(CONNECTION_STRING, ownerId);

      await expect(repository.undoConfirmed(randomUUID())).rejects.toBeInstanceOf(ImportBatchNotFoundError);
    });

    it("throws when the batch's Reconciliation has a Discrepancy with an Adjustment", async () => {
      const ownerId = randomUUID();
      const { account } = await seedOwnerWithAccount(ownerId);
      const repository = new PgImportBatchRepository(CONNECTION_STRING, ownerId);
      const batchId = randomUUID();

      await repository.create(
        {
          id: batchId,
          accountId: account.id,
          source: "statement.pdf",
          createdAt: "2026-02-01T00:00:00.000Z",
          closingBalance: "60000.00",
          asOfDate: "2026-01-31"
        },
        [{ id: randomUUID(), amount: "50000.00", occurredAt: "2026-01-01", description: "Salary", category: null }]
      );
      const confirmed = await repository.confirmAll(batchId);
      const reconciliationRepository = new PgReconciliationRepository(CONNECTION_STRING, ownerId);
      await reconciliationRepository.resolveWithAdjustment(`${confirmed.reconciliationId}-discrepancy`, {
        id: randomUUID(),
        accountId: account.id,
        amountMinor: 10_000_00,
        occurredAt: "2026-02-01T00:00:00.000Z",
        description: "Adjustment"
      });

      await expect(repository.undoConfirmed(batchId)).rejects.toBeInstanceOf(ImportBatchUndoBlockedError);
      expect(await repository.getById(batchId)).not.toBeNull();
    });

    it("throws when a later Reconciliation exists for the same Account", async () => {
      const ownerId = randomUUID();
      const { account } = await seedOwnerWithAccount(ownerId);
      const repository = new PgImportBatchRepository(CONNECTION_STRING, ownerId);
      const batchId = randomUUID();

      await repository.create(
        {
          id: batchId,
          accountId: account.id,
          source: "statement.pdf",
          createdAt: "2026-02-01T00:00:00.000Z",
          closingBalance: "60000.00",
          asOfDate: "2026-01-31"
        },
        [{ id: randomUUID(), amount: "60000.00", occurredAt: "2026-01-01", description: "Salary", category: null }]
      );
      await repository.confirmAll(batchId);

      const laterSnapshotId = randomUUID();
      await new PgBalanceSnapshotRepository(CONNECTION_STRING, ownerId).create({
        id: laterSnapshotId,
        accountId: account.id,
        asOfDate: "2026-02-28",
        balanceMinor: 60_000_00
      });
      await new PgReconciliationRepository(CONNECTION_STRING, ownerId).create({
        id: randomUUID(),
        accountId: account.id,
        balanceSnapshotId: laterSnapshotId,
        reconciledAt: "2026-03-01T00:00:00.000Z"
      });

      await expect(repository.undoConfirmed(batchId)).rejects.toBeInstanceOf(ImportBatchUndoBlockedError);
      expect(await repository.getById(batchId)).not.toBeNull();
    });
  });
});
