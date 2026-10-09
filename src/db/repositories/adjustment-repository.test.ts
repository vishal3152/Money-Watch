import { describe, expect, it } from "vitest";

import type { DrizzleDb } from "@/db/client";
import { AccountRepository } from "@/db/repositories/account-repository";
import { AdjustmentRepository } from "@/db/repositories/adjustment-repository";
import { BalanceSnapshotRepository } from "@/db/repositories/balance-snapshot-repository";
import { DatabaseConstraintError } from "@/db/errors";
import { InstitutionRepository } from "@/db/repositories/institution-repository";
import { ReconciliationRepository } from "@/db/repositories/reconciliation-repository";
import { createTestDb } from "@/db/repositories/test-db";
import { TransactionRepository } from "@/db/repositories/transaction-repository";

describe("AdjustmentRepository", () => {
  async function seedDiscrepancy(db: DrizzleDb) {
    const institutionRepository = new InstitutionRepository(db);
    const accountRepository = new AccountRepository(db);
    const transactionRepository = new TransactionRepository(db);
    const balanceSnapshotRepository = new BalanceSnapshotRepository(db);
    const reconciliationRepository = new ReconciliationRepository(db);

    await institutionRepository.create({ id: "inst-1", name: "Bank One" });
    await accountRepository.create({
      id: "acc-1",
      institutionId: "inst-1",
      name: "Primary Checking",
      accountNumber: null,
      currencyCode: "INR"
    });
    await transactionRepository.create({
      id: "txn-1",
      accountId: "acc-1",
      amountMinor: 100_000,
      occurredAt: "2026-01-10T00:00:00.000Z",
      description: "Deposit",
      trustStatus: "Confirmed",
      transferId: null,
      category: null,
      importBatchId: null
    });
    await balanceSnapshotRepository.create({
      id: "snap-1",
      accountId: "acc-1",
      asOfDate: "2026-01-31",
      balanceMinor: 105_000
    });

    await reconciliationRepository.create({
      id: "recon-1",
      accountId: "acc-1",
      balanceSnapshotId: "snap-1",
      reconciledAt: "2026-02-01T00:00:00.000Z"
    });

    return "recon-1-discrepancy";
  }

  it("persists an Adjustment's Transaction and links it to the Discrepancy", async () => {
    const testDb = createTestDb();
    const discrepancyId = await seedDiscrepancy(testDb.db);

    const transactionRepository = new TransactionRepository(testDb.db);
    const repository = new AdjustmentRepository(testDb.db);

    const adjustment = await repository.create(
      {
        id: "adj-txn-1",
        accountId: "acc-1",
        amountMinor: 5_000,
        occurredAt: "2026-02-01T00:00:00.000Z",
        description: "Owner correction for missed deposit"
      },
      discrepancyId
    );

    expect(adjustment).toEqual({
      id: "adj-txn-1-adjustment",
      transactionId: "adj-txn-1",
      discrepancyId: "recon-1-discrepancy"
    });

    const accountTransactions = await transactionRepository.listByAccountId("acc-1");
    expect(accountTransactions).toContainEqual({
      id: "adj-txn-1",
      accountId: "acc-1",
      amountMinor: 5_000,
      occurredAt: "2026-02-01T00:00:00.000Z",
      description: "Owner correction for missed deposit",
      trustStatus: "Confirmed",
      transferId: null,
      category: null,
      importBatchId: null,
      externalRef: null,
      possibleDuplicateOfTransactionId: null
    });

    const linked = await repository.getByDiscrepancyId("recon-1-discrepancy");
    expect(linked).toEqual(adjustment);
  });

  it("rejects an Adjustment referencing an unknown Discrepancy and persists nothing", async () => {
    const testDb = createTestDb();

    const institutionRepository = new InstitutionRepository(testDb.db);
    const accountRepository = new AccountRepository(testDb.db);
    const transactionRepository = new TransactionRepository(testDb.db);
    const repository = new AdjustmentRepository(testDb.db);

    await institutionRepository.create({ id: "inst-1", name: "Bank One" });
    await accountRepository.create({
      id: "acc-1",
      institutionId: "inst-1",
      name: "Primary Checking",
      accountNumber: null,
      currencyCode: "INR"
    });

    await expect(
      repository.create(
        {
          id: "adj-txn-1",
          accountId: "acc-1",
          amountMinor: 5_000,
          occurredAt: "2026-02-01T00:00:00.000Z",
          description: "Owner correction"
        },
        "missing-discrepancy"
      )
    ).rejects.toBeInstanceOf(DatabaseConstraintError);

    const accountTransactions = await transactionRepository.listByAccountId("acc-1");
    expect(accountTransactions).toEqual([]);
  });

  it("finds an Adjustment by Transaction id and returns null for an ordinary Transaction", async () => {
    const testDb = createTestDb();
    const discrepancyId = await seedDiscrepancy(testDb.db);
    const repository = new AdjustmentRepository(testDb.db);
    await repository.create(
      {
        id: "adj-txn-1",
        accountId: "acc-1",
        amountMinor: 5_000,
        occurredAt: "2026-02-01T00:00:00.000Z",
        description: "Owner correction"
      },
      discrepancyId
    );

    expect(await repository.getByTransactionId("txn-1")).toBeNull();
    expect(await repository.getByTransactionId("adj-txn-1")).toEqual({
      id: "adj-txn-1-adjustment",
      transactionId: "adj-txn-1",
      discrepancyId
    });
  });

  it("finds several Transactions' Adjustments in one call, omitting Transactions with none", async () => {
    const testDb = createTestDb();
    const discrepancyId = await seedDiscrepancy(testDb.db);
    const repository = new AdjustmentRepository(testDb.db);
    await repository.create(
      {
        id: "adj-txn-1",
        accountId: "acc-1",
        amountMinor: 5_000,
        occurredAt: "2026-02-01T00:00:00.000Z",
        description: "Owner correction"
      },
      discrepancyId
    );

    expect(await repository.listByTransactionIds(["txn-1", "adj-txn-1"])).toEqual([
      { id: "adj-txn-1-adjustment", transactionId: "adj-txn-1", discrepancyId }
    ]);
    expect(await repository.listByTransactionIds([])).toEqual([]);
  });
});
