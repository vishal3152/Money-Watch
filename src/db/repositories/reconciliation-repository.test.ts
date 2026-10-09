import { describe, expect, it } from "vitest";

import type { DrizzleDb } from "@/db/client";
import { AccountRepository } from "@/db/repositories/account-repository";
import { AdjustmentRepository } from "@/db/repositories/adjustment-repository";
import { BalanceSnapshotRepository } from "@/db/repositories/balance-snapshot-repository";
import { DiscrepancyAlreadyResolvedError, DiscrepancyNotFoundError } from "@/db/errors";
import { InstitutionRepository } from "@/db/repositories/institution-repository";
import { ReconciliationRepository } from "@/db/repositories/reconciliation-repository";
import { createTestDb } from "@/db/repositories/test-db";
import { TransactionRepository } from "@/db/repositories/transaction-repository";

describe("ReconciliationRepository", () => {
  async function seedAccountWithTransactions(db: DrizzleDb) {
    const institutionRepository = new InstitutionRepository(db);
    const accountRepository = new AccountRepository(db);
    const transactionRepository = new TransactionRepository(db);

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
  }

  it("persists a Reconciliation with no Discrepancy when the snapshot matches the computed balance", async () => {
    const testDb = createTestDb();
    await seedAccountWithTransactions(testDb.db);

    const balanceSnapshotRepository = new BalanceSnapshotRepository(testDb.db);
    await balanceSnapshotRepository.create({
      id: "snap-1",
      accountId: "acc-1",
      asOfDate: "2026-01-31",
      balanceMinor: 100_000
    });

    const repository = new ReconciliationRepository(testDb.db);

    const reconciliation = await repository.create({
      id: "recon-1",
      accountId: "acc-1",
      balanceSnapshotId: "snap-1",
      reconciledAt: "2026-02-01T00:00:00.000Z"
    });

    expect(reconciliation).toEqual({
      id: "recon-1",
      accountId: "acc-1",
      balanceSnapshotId: "snap-1",
      computedBalanceMinor: 100_000,
      reconciledAt: "2026-02-01T00:00:00.000Z"
    });

    const stored = await repository.getById("recon-1");
    expect(stored).toEqual(reconciliation);

    const discrepancy = await repository.getDiscrepancyByReconciliationId("recon-1");
    expect(discrepancy).toBeNull();
  });

  it("persists a signed Discrepancy when the snapshot does not match the computed balance", async () => {
    const testDb = createTestDb();
    await seedAccountWithTransactions(testDb.db);

    const balanceSnapshotRepository = new BalanceSnapshotRepository(testDb.db);
    await balanceSnapshotRepository.create({
      id: "snap-1",
      accountId: "acc-1",
      asOfDate: "2026-01-31",
      balanceMinor: 105_000
    });

    const repository = new ReconciliationRepository(testDb.db);

    const reconciliation = await repository.create({
      id: "recon-1",
      accountId: "acc-1",
      balanceSnapshotId: "snap-1",
      reconciledAt: "2026-02-01T00:00:00.000Z"
    });

    expect(reconciliation.computedBalanceMinor).toBe(100_000);

    const discrepancy = await repository.getDiscrepancyByReconciliationId("recon-1");

    expect(discrepancy).toEqual({
      id: "recon-1-discrepancy",
      reconciliationId: "recon-1",
      amountMinor: 5_000,
      resolution: null
    });
  });

  it("persists and returns a Discrepancy's resolution once resolved", async () => {
    const testDb = createTestDb();
    await seedAccountWithTransactions(testDb.db);

    const balanceSnapshotRepository = new BalanceSnapshotRepository(testDb.db);
    await balanceSnapshotRepository.create({
      id: "snap-1",
      accountId: "acc-1",
      asOfDate: "2026-01-31",
      balanceMinor: 105_000
    });

    const repository = new ReconciliationRepository(testDb.db);

    await repository.create({
      id: "recon-1",
      accountId: "acc-1",
      balanceSnapshotId: "snap-1",
      reconciledAt: "2026-02-01T00:00:00.000Z"
    });

    const resolved = await repository.resolveDiscrepancy("recon-1-discrepancy", "disputed-with-bank");

    expect(resolved).toEqual({
      id: "recon-1-discrepancy",
      reconciliationId: "recon-1",
      amountMinor: 5_000,
      resolution: "disputed-with-bank"
    });

    const discrepancy = await repository.getDiscrepancyByReconciliationId("recon-1");
    expect(discrepancy).toEqual(resolved);
  });

  it("rejects resolving an already-resolved Discrepancy a second time, instead of silently overwriting it", async () => {
    const testDb = createTestDb();
    await seedAccountWithTransactions(testDb.db);
    const balanceSnapshotRepository = new BalanceSnapshotRepository(testDb.db);
    await balanceSnapshotRepository.create({
      id: "snap-1",
      accountId: "acc-1",
      asOfDate: "2026-01-31",
      balanceMinor: 105_000
    });
    const repository = new ReconciliationRepository(testDb.db);
    await repository.create({
      id: "recon-1",
      accountId: "acc-1",
      balanceSnapshotId: "snap-1",
      reconciledAt: "2026-02-01T00:00:00.000Z"
    });
    await repository.resolveDiscrepancy("recon-1-discrepancy", "disputed-with-bank");

    // The Server Action layer already guards the sequential double-submit case; this is the
    // atomic gate against two concurrent submissions (a double-click, or a back-button resubmit)
    // both reading resolution === null before either writes.
    await expect(
      repository.resolveDiscrepancy("recon-1-discrepancy", "corrected-my-record")
    ).rejects.toBeInstanceOf(DiscrepancyAlreadyResolvedError);

    const discrepancy = await repository.getDiscrepancyByReconciliationId("recon-1");
    expect(discrepancy?.resolution).toBe("disputed-with-bank");
  });

  it("lists an Account's Reconciliations by reconciled time then id", async () => {
    const testDb = createTestDb();
    await seedAccountWithTransactions(testDb.db);
    const snapshots = new BalanceSnapshotRepository(testDb.db);
    const reconciliations = new ReconciliationRepository(testDb.db);
    await snapshots.create({
      id: "snap-1",
      accountId: "acc-1",
      asOfDate: "2026-01-31",
      balanceMinor: 100_000
    });
    await snapshots.create({
      id: "snap-2",
      accountId: "acc-1",
      asOfDate: "2026-02-28",
      balanceMinor: 100_000
    });
    await reconciliations.create({
      id: "recon-b",
      accountId: "acc-1",
      balanceSnapshotId: "snap-2",
      reconciledAt: "2026-03-01T00:00:00.000Z"
    });
    await reconciliations.create({
      id: "recon-a",
      accountId: "acc-1",
      balanceSnapshotId: "snap-1",
      reconciledAt: "2026-02-01T00:00:00.000Z"
    });

    expect((await reconciliations.listByAccountId("acc-1")).map((item) => item.id)).toEqual([
      "recon-a",
      "recon-b"
    ]);
    expect(await reconciliations.listByAccountId("missing")).toEqual([]);
  });

  it("lists several Reconciliations' Discrepancies in one call", async () => {
    const testDb = createTestDb();
    await seedAccountWithTransactions(testDb.db);
    await new AccountRepository(testDb.db).create({
      id: "acc-2",
      institutionId: "inst-1",
      name: "Savings",
      accountNumber: null,
      currencyCode: "INR"
    });
    const snapshots = new BalanceSnapshotRepository(testDb.db);
    const reconciliations = new ReconciliationRepository(testDb.db);
    await snapshots.create({ id: "snap-1", accountId: "acc-1", asOfDate: "2026-01-31", balanceMinor: 100_000 });
    await snapshots.create({ id: "snap-2", accountId: "acc-2", asOfDate: "2026-01-31", balanceMinor: 999 });
    await reconciliations.create({
      id: "recon-a",
      accountId: "acc-1",
      balanceSnapshotId: "snap-1",
      reconciledAt: "2026-02-01T00:00:00.000Z"
    });
    const mismatched = await reconciliations.create({
      id: "recon-b",
      accountId: "acc-2",
      balanceSnapshotId: "snap-2",
      reconciledAt: "2026-02-02T00:00:00.000Z"
    });

    const discrepancies = await reconciliations.listDiscrepanciesByReconciliationIds(["recon-a", "recon-b"]);
    expect(discrepancies).toEqual([
      { id: "recon-b-discrepancy", reconciliationId: mismatched.id, amountMinor: 999, resolution: null }
    ]);

    expect(await reconciliations.listDiscrepanciesByReconciliationIds([])).toEqual([]);
  });

  it("atomically resolves a Discrepancy with its Adjustment Transaction", async () => {
    const testDb = createTestDb();
    await seedAccountWithTransactions(testDb.db);
    const snapshots = new BalanceSnapshotRepository(testDb.db);
    const reconciliations = new ReconciliationRepository(testDb.db);
    await snapshots.create({
      id: "snap-1",
      accountId: "acc-1",
      asOfDate: "2026-01-31",
      balanceMinor: 105_000
    });
    await reconciliations.create({
      id: "recon-1",
      accountId: "acc-1",
      balanceSnapshotId: "snap-1",
      reconciledAt: "2026-02-01T00:00:00.000Z"
    });

    const adjustment = await reconciliations.resolveWithAdjustment("recon-1-discrepancy", {
      id: "adj-txn-1",
      accountId: "acc-1",
      amountMinor: 5_000,
      occurredAt: "2026-02-01T00:00:00.000Z",
      description: "Owner correction"
    });

    expect(adjustment).toEqual({
      id: "adj-txn-1-adjustment",
      transactionId: "adj-txn-1",
      discrepancyId: "recon-1-discrepancy"
    });
    expect(await reconciliations.getDiscrepancyByReconciliationId("recon-1")).toMatchObject({
      resolution: "corrected-my-record"
    });
    expect(
      await new AdjustmentRepository(testDb.db).getByDiscrepancyId("recon-1-discrepancy")
    ).toEqual(adjustment);
  });

  it("does not create a second Adjustment when resolveWithAdjustment is called twice for an already-resolved Discrepancy", async () => {
    const testDb = createTestDb();
    await seedAccountWithTransactions(testDb.db);
    const snapshots = new BalanceSnapshotRepository(testDb.db);
    const reconciliations = new ReconciliationRepository(testDb.db);
    await snapshots.create({
      id: "snap-1",
      accountId: "acc-1",
      asOfDate: "2026-01-31",
      balanceMinor: 105_000
    });
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

    // resolve-actions.ts guards this at the Server Action layer by re-reading
    // discrepancy.resolution first, but the repository method itself — the last line of
    // defense against two concurrent submissions racing past that check — has no equivalent
    // guard, and adjustments.discrepancy_id carries no unique constraint. A second, distinct
    // (different id) Adjustment for the same already-resolved Discrepancy must not be allowed:
    // it would silently double the ledger correction.
    await expect(
      reconciliations.resolveWithAdjustment("recon-1-discrepancy", {
        id: "adj-txn-2",
        accountId: "acc-1",
        amountMinor: 5_000,
        occurredAt: "2026-02-01T00:00:00.000Z",
        description: "Racing second correction"
      })
    ).rejects.toBeInstanceOf(DiscrepancyAlreadyResolvedError);

    const transactions = new TransactionRepository(testDb.db);
    expect((await transactions.listByAccountId("acc-1")).map((item) => item.id).sort()).toEqual([
      "adj-txn-1",
      "txn-1"
    ]);
  });

  it("rolls back an Adjustment Transaction when its Discrepancy does not exist", async () => {
    const testDb = createTestDb();
    await seedAccountWithTransactions(testDb.db);
    const reconciliations = new ReconciliationRepository(testDb.db);
    const transactions = new TransactionRepository(testDb.db);

    await expect(
      reconciliations.resolveWithAdjustment("missing", {
        id: "adj-txn-1",
        accountId: "acc-1",
        amountMinor: 5_000,
        occurredAt: "2026-02-01T00:00:00.000Z",
        description: "Owner correction"
      })
    ).rejects.toBeInstanceOf(DiscrepancyNotFoundError);

    expect((await transactions.listByAccountId("acc-1")).map((item) => item.id)).toEqual(["txn-1"]);
  });

  async function seedSecondAccount(db: DrizzleDb) {
    await new AccountRepository(db).create({
      id: "acc-2",
      institutionId: "inst-1",
      name: "Savings",
      accountNumber: null,
      currencyCode: "INR"
    });
    await new TransactionRepository(db).create({
      id: "txn-2",
      accountId: "acc-2",
      amountMinor: 50_000,
      occurredAt: "2026-01-10T00:00:00.000Z",
      description: "Deposit",
      trustStatus: "Confirmed",
      transferId: null,
      category: null,
      importBatchId: null
    });
  }

  /** Reconciles `accountId` against a snapshot that deliberately mismatches, producing a Discrepancy. */
  async function reconcileWithDiscrepancy(
    db: DrizzleDb,
    options: { accountId: string; snapshotId: string; reconciliationId: string; balanceMinor: number }
  ) {
    await new BalanceSnapshotRepository(db).create({
      id: options.snapshotId,
      accountId: options.accountId,
      asOfDate: "2026-01-31",
      balanceMinor: options.balanceMinor
    });

    return new ReconciliationRepository(db).create({
      id: options.reconciliationId,
      accountId: options.accountId,
      balanceSnapshotId: options.snapshotId,
      reconciledAt: "2026-02-01T00:00:00.000Z"
    });
  }

  describe("countOpenDiscrepanciesByAccountIds", () => {
    it("counts only unresolved Discrepancies, grouped by Account", async () => {
      const testDb = createTestDb();
      await seedAccountWithTransactions(testDb.db);
      await seedSecondAccount(testDb.db);

      await reconcileWithDiscrepancy(testDb.db, {
        accountId: "acc-1",
        snapshotId: "snap-1",
        reconciliationId: "recon-1",
        balanceMinor: 120_000
      });
      await reconcileWithDiscrepancy(testDb.db, {
        accountId: "acc-2",
        snapshotId: "snap-2",
        reconciliationId: "recon-2",
        balanceMinor: 70_000
      });

      const repository = new ReconciliationRepository(testDb.db);
      await repository.resolveDiscrepancy("recon-2-discrepancy", "disputed-with-bank");

      expect(await repository.countOpenDiscrepanciesByAccountIds(["acc-1", "acc-2"])).toEqual([
        { accountId: "acc-1", openDiscrepancies: 1 }
      ]);
    });

    it("counts each Account's open Discrepancies across several Reconciliations", async () => {
      const testDb = createTestDb();
      await seedAccountWithTransactions(testDb.db);

      await reconcileWithDiscrepancy(testDb.db, {
        accountId: "acc-1",
        snapshotId: "snap-1",
        reconciliationId: "recon-1",
        balanceMinor: 120_000
      });
      await reconcileWithDiscrepancy(testDb.db, {
        accountId: "acc-1",
        snapshotId: "snap-2",
        reconciliationId: "recon-2",
        balanceMinor: 130_000
      });

      const repository = new ReconciliationRepository(testDb.db);

      expect(await repository.countOpenDiscrepanciesByAccountIds(["acc-1"])).toEqual([
        { accountId: "acc-1", openDiscrepancies: 2 }
      ]);
    });

    it("returns no entry for an Account whose Reconciliations all matched", async () => {
      const testDb = createTestDb();
      await seedAccountWithTransactions(testDb.db);

      await reconcileWithDiscrepancy(testDb.db, {
        accountId: "acc-1",
        snapshotId: "snap-1",
        reconciliationId: "recon-1",
        balanceMinor: 100_000
      });

      const repository = new ReconciliationRepository(testDb.db);

      expect(await repository.countOpenDiscrepanciesByAccountIds(["acc-1"])).toEqual([]);
    });

    it("returns an empty list for no Account ids", async () => {
      const testDb = createTestDb();

      expect(
        await new ReconciliationRepository(testDb.db).countOpenDiscrepanciesByAccountIds([])
      ).toEqual([]);
    });
  });

  describe("listAdjustmentLinksByAccountId", () => {
    it("maps each Adjustment Transaction to the Reconciliation it corrected", async () => {
      const testDb = createTestDb();
      await seedAccountWithTransactions(testDb.db);
      await reconcileWithDiscrepancy(testDb.db, {
        accountId: "acc-1",
        snapshotId: "snap-1",
        reconciliationId: "recon-1",
        balanceMinor: 120_000
      });

      const repository = new ReconciliationRepository(testDb.db);
      await repository.resolveWithAdjustment("recon-1-discrepancy", {
        id: "adj-txn-1",
        accountId: "acc-1",
        amountMinor: 20_000,
        occurredAt: "2026-02-01T00:00:00.000Z",
        description: "Owner correction"
      });

      expect(await repository.listAdjustmentLinksByAccountId("acc-1")).toEqual([
        { transactionId: "adj-txn-1", reconciliationId: "recon-1" }
      ]);
    });

    it("excludes Adjustments belonging to another Account", async () => {
      const testDb = createTestDb();
      await seedAccountWithTransactions(testDb.db);
      await seedSecondAccount(testDb.db);
      await reconcileWithDiscrepancy(testDb.db, {
        accountId: "acc-2",
        snapshotId: "snap-2",
        reconciliationId: "recon-2",
        balanceMinor: 70_000
      });

      const repository = new ReconciliationRepository(testDb.db);
      await repository.resolveWithAdjustment("recon-2-discrepancy", {
        id: "adj-txn-2",
        accountId: "acc-2",
        amountMinor: 20_000,
        occurredAt: "2026-02-01T00:00:00.000Z",
        description: "Owner correction"
      });

      expect(await repository.listAdjustmentLinksByAccountId("acc-1")).toEqual([]);
    });

    it("returns an empty list for an Account with no Adjustments", async () => {
      const testDb = createTestDb();
      await seedAccountWithTransactions(testDb.db);

      expect(
        await new ReconciliationRepository(testDb.db).listAdjustmentLinksByAccountId("acc-1")
      ).toEqual([]);
    });
  });
});
