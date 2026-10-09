import { randomUUID } from "node:crypto";

import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";

import { PgAccountRepository } from "@/db/postgres/repositories/account-repository";
import { PgAdjustmentRepository } from "@/db/postgres/repositories/adjustment-repository";
import { PgBalanceSnapshotRepository } from "@/db/postgres/repositories/balance-snapshot-repository";
import { PgInstitutionRepository } from "@/db/postgres/repositories/institution-repository";
import { PgReconciliationRepository } from "@/db/postgres/repositories/reconciliation-repository";
import { PgTransactionRepository } from "@/db/postgres/repositories/transaction-repository";
import { BalanceSnapshotNotFoundError, DiscrepancyNotFoundError } from "@/db/errors";

const CONNECTION_STRING =
  process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

const admin = postgres(CONNECTION_STRING, { max: 1 });

afterAll(async () => {
  await admin.end();
});

async function seedOwnerWithAccountAndTransaction(ownerId: string) {
  const institution = { id: randomUUID(), name: "Bank" };
  const account = {
    id: randomUUID(),
    institutionId: institution.id,
    name: "Checking",
    accountNumber: null,
    currencyCode: "USD"
  };
  const transaction = {
    id: randomUUID(),
    accountId: account.id,
    amountMinor: 100_000,
    occurredAt: "2026-01-10T00:00:00.000Z",
    description: "Deposit",
    trustStatus: "Confirmed" as const,
    transferId: null,
    category: null,
    importBatchId: null
  };

  await new PgInstitutionRepository(CONNECTION_STRING, ownerId).create(institution);
  await new PgAccountRepository(CONNECTION_STRING, ownerId).create(account);
  await new PgTransactionRepository(CONNECTION_STRING, ownerId).create(transaction);

  return { institution, account, transaction };
}

describe("PgReconciliationRepository", () => {
  it("creates Reconciliations with and without Discrepancies for the scoped Owner", async () => {
    const ownerA = randomUUID();
    const ownerB = randomUUID();
    const {
      institution: institutionA,
      account: accountA,
      transaction: transactionA
    } = await seedOwnerWithAccountAndTransaction(ownerA);
    const {
      institution: institutionB,
      account: accountB,
      transaction: transactionB
    } = await seedOwnerWithAccountAndTransaction(ownerB);
    const snapshotA1 = {
      id: randomUUID(),
      accountId: accountA.id,
      asOfDate: "2026-01-31",
      balanceMinor: 95_000
    };
    const snapshotA2 = {
      id: randomUUID(),
      accountId: accountA.id,
      asOfDate: "2026-02-28",
      balanceMinor: 100_000
    };
    const snapshotB = {
      id: randomUUID(),
      accountId: accountB.id,
      asOfDate: "2026-01-31",
      balanceMinor: 999_999
    };
    const reconA1Id = randomUUID();
    const reconA2Id = randomUUID();
    const reconBId = randomUUID();

    try {
      const snapshotsA = new PgBalanceSnapshotRepository(CONNECTION_STRING, ownerA);
      const snapshotsB = new PgBalanceSnapshotRepository(CONNECTION_STRING, ownerB);
      await snapshotsA.create(snapshotA1);
      await snapshotsA.create(snapshotA2);
      await snapshotsB.create(snapshotB);

      const repoA = new PgReconciliationRepository(CONNECTION_STRING, ownerA);
      const repoB = new PgReconciliationRepository(CONNECTION_STRING, ownerB);
      const matching = await repoA.create({
        id: reconA2Id,
        accountId: accountA.id,
        balanceSnapshotId: snapshotA2.id,
        reconciledAt: "2026-03-01T00:00:00.000Z"
      });
      const mismatched = await repoA.create({
        id: reconA1Id,
        accountId: accountA.id,
        balanceSnapshotId: snapshotA1.id,
        reconciledAt: "2026-02-01T00:00:00.000Z"
      });
      await repoB.create({
        id: reconBId,
        accountId: accountB.id,
        balanceSnapshotId: snapshotB.id,
        reconciledAt: "2026-02-01T00:00:00.000Z"
      });

      expect(mismatched).toEqual({
        id: reconA1Id,
        accountId: accountA.id,
        balanceSnapshotId: snapshotA1.id,
        computedBalanceMinor: 100_000,
        reconciledAt: "2026-02-01T00:00:00.000Z"
      });
      expect(await repoA.getById(reconBId)).toBeNull();
      expect(await repoA.listByAccountId(accountA.id)).toEqual([mismatched, matching]);
      expect(await repoA.getDiscrepancyByReconciliationId(reconA2Id)).toBeNull();
      expect(await repoA.getDiscrepancyByReconciliationId(reconA1Id)).toEqual({
        id: `${reconA1Id}-discrepancy`,
        reconciliationId: reconA1Id,
        amountMinor: -5_000,
        resolution: null
      });
    } finally {
      await admin`delete from discrepancies where reconciliation_id in (${reconA1Id}, ${reconA2Id}, ${reconBId})`;
      await admin`delete from reconciliations where id in (${reconA1Id}, ${reconA2Id}, ${reconBId})`;
      await admin`delete from balance_snapshots where id in (${snapshotA1.id}, ${snapshotA2.id}, ${snapshotB.id})`;
      await admin`delete from transactions where id in (${transactionA.id}, ${transactionB.id})`;
      await admin`delete from accounts where id in (${accountA.id}, ${accountB.id})`;
      await admin`delete from institutions where id in (${institutionA.id}, ${institutionB.id})`;
    }
  });

  it("persists and returns a scoped Discrepancy resolution", async () => {
    const ownerId = randomUUID();
    const { institution, account, transaction } = await seedOwnerWithAccountAndTransaction(ownerId);
    const snapshot = {
      id: randomUUID(),
      accountId: account.id,
      asOfDate: "2026-01-31",
      balanceMinor: 105_000
    };
    const reconciliationId = randomUUID();

    try {
      await new PgBalanceSnapshotRepository(CONNECTION_STRING, ownerId).create(snapshot);

      const repo = new PgReconciliationRepository(CONNECTION_STRING, ownerId);
      await repo.create({
        id: reconciliationId,
        accountId: account.id,
        balanceSnapshotId: snapshot.id,
        reconciledAt: "2026-02-01T00:00:00.000Z"
      });

      const resolved = await repo.resolveDiscrepancy(`${reconciliationId}-discrepancy`, "disputed-with-bank");

      expect(resolved).toEqual({
        id: `${reconciliationId}-discrepancy`,
        reconciliationId,
        amountMinor: 5_000,
        resolution: "disputed-with-bank"
      });
      expect(await repo.getDiscrepancyByReconciliationId(reconciliationId)).toEqual(resolved);
    } finally {
      await admin`delete from discrepancies where reconciliation_id = ${reconciliationId}`;
      await admin`delete from reconciliations where id = ${reconciliationId}`;
      await admin`delete from balance_snapshots where id = ${snapshot.id}`;
      await admin`delete from transactions where id = ${transaction.id}`;
      await admin`delete from accounts where id = ${account.id}`;
      await admin`delete from institutions where id = ${institution.id}`;
    }
  });

  it("atomically resolves a Discrepancy with its Adjustment Transaction", async () => {
    const ownerId = randomUUID();
    const { institution, account, transaction } = await seedOwnerWithAccountAndTransaction(ownerId);
    const snapshot = {
      id: randomUUID(),
      accountId: account.id,
      asOfDate: "2026-01-31",
      balanceMinor: 105_000
    };
    const reconciliationId = randomUUID();
    const adjustmentTransaction = {
      id: randomUUID(),
      accountId: account.id,
      amountMinor: 5_000,
      occurredAt: "2026-02-01T00:00:00.000Z",
      description: "Owner correction"
    };

    try {
      await new PgBalanceSnapshotRepository(CONNECTION_STRING, ownerId).create(snapshot);

      const repo = new PgReconciliationRepository(CONNECTION_STRING, ownerId);
      await repo.create({
        id: reconciliationId,
        accountId: account.id,
        balanceSnapshotId: snapshot.id,
        reconciledAt: "2026-02-01T00:00:00.000Z"
      });

      const adjustment = await repo.resolveWithAdjustment(`${reconciliationId}-discrepancy`, adjustmentTransaction);

      expect(adjustment).toEqual({
        id: `${adjustmentTransaction.id}-adjustment`,
        transactionId: adjustmentTransaction.id,
        discrepancyId: `${reconciliationId}-discrepancy`
      });
      expect(await repo.getDiscrepancyByReconciliationId(reconciliationId)).toMatchObject({
        resolution: "corrected-my-record"
      });
      expect(
        await new PgAdjustmentRepository(CONNECTION_STRING, ownerId).getByDiscrepancyId(
          `${reconciliationId}-discrepancy`
        )
      ).toEqual(adjustment);
    } finally {
      await admin`delete from adjustments where transaction_id = ${adjustmentTransaction.id}`;
      await admin`delete from transactions where id = ${adjustmentTransaction.id}`;
      await admin`delete from discrepancies where reconciliation_id = ${reconciliationId}`;
      await admin`delete from reconciliations where id = ${reconciliationId}`;
      await admin`delete from balance_snapshots where id = ${snapshot.id}`;
      await admin`delete from transactions where id = ${transaction.id}`;
      await admin`delete from accounts where id = ${account.id}`;
      await admin`delete from institutions where id = ${institution.id}`;
    }
  });

  it("rolls back an Adjustment Transaction when its Discrepancy does not exist", async () => {
    const ownerId = randomUUID();
    const { institution, account, transaction } = await seedOwnerWithAccountAndTransaction(ownerId);
    const adjustmentTransaction = {
      id: randomUUID(),
      accountId: account.id,
      amountMinor: 5_000,
      occurredAt: "2026-02-01T00:00:00.000Z",
      description: "Owner correction"
    };

    try {
      await expect(
        new PgReconciliationRepository(CONNECTION_STRING, ownerId).resolveWithAdjustment(
          "missing-discrepancy",
          adjustmentTransaction
        )
      ).rejects.toBeInstanceOf(DiscrepancyNotFoundError);

      expect(
        (await new PgTransactionRepository(CONNECTION_STRING, ownerId).listByAccountId(account.id)).map(
          (item) => item.id
        )
      ).toEqual([transaction.id]);
    } finally {
      await admin`delete from transactions where id = ${adjustmentTransaction.id}`;
      await admin`delete from transactions where id = ${transaction.id}`;
      await admin`delete from accounts where id = ${account.id}`;
      await admin`delete from institutions where id = ${institution.id}`;
    }
  });

  it("includes a Transaction at the last instant of asOfDate but excludes the next day", async () => {
    const ownerId = randomUUID();
    const institution = { id: randomUUID(), name: "Bank" };
    const account = {
      id: randomUUID(),
      institutionId: institution.id,
      name: "Checking",
      accountNumber: null,
      currencyCode: "USD"
    };
    const withinCutoff = {
      id: randomUUID(),
      accountId: account.id,
      amountMinor: 1_000,
      occurredAt: "2026-01-31T23:59:59.999Z",
      description: "Just before midnight",
      trustStatus: "Confirmed" as const,
      transferId: null,
      category: null,
      importBatchId: null
    };
    const afterCutoff = {
      id: randomUUID(),
      accountId: account.id,
      amountMinor: 5_000,
      occurredAt: "2026-02-01T00:00:00.000Z",
      description: "Just after midnight",
      trustStatus: "Confirmed" as const,
      transferId: null,
      category: null,
      importBatchId: null
    };
    const snapshot = { id: randomUUID(), accountId: account.id, asOfDate: "2026-01-31", balanceMinor: 1_000 };
    const reconciliationId = randomUUID();

    try {
      await new PgInstitutionRepository(CONNECTION_STRING, ownerId).create(institution);
      await new PgAccountRepository(CONNECTION_STRING, ownerId).create(account);
      await new PgTransactionRepository(CONNECTION_STRING, ownerId).create(withinCutoff);
      await new PgTransactionRepository(CONNECTION_STRING, ownerId).create(afterCutoff);
      await new PgBalanceSnapshotRepository(CONNECTION_STRING, ownerId).create(snapshot);

      const reconciliation = await new PgReconciliationRepository(CONNECTION_STRING, ownerId).create({
        id: reconciliationId,
        accountId: account.id,
        balanceSnapshotId: snapshot.id,
        reconciledAt: "2026-02-02T00:00:00.000Z"
      });

      expect(reconciliation.computedBalanceMinor).toBe(1_000);
    } finally {
      await admin`delete from discrepancies where reconciliation_id = ${reconciliationId}`;
      await admin`delete from reconciliations where id = ${reconciliationId}`;
      await admin`delete from balance_snapshots where id = ${snapshot.id}`;
      await admin`delete from transactions where id in (${withinCutoff.id}, ${afterCutoff.id})`;
      await admin`delete from accounts where id = ${account.id}`;
      await admin`delete from institutions where id = ${institution.id}`;
    }
  });

  it("counts open Discrepancies per Account and batches Discrepancies across Reconciliations, scoped to the calling Owner", async () => {
    const ownerA = randomUUID();
    const ownerB = randomUUID();
    const {
      institution: institutionA,
      account: accountA1,
      transaction: transactionA1
    } = await seedOwnerWithAccountAndTransaction(ownerA);
    const accountA2 = {
      id: randomUUID(),
      institutionId: institutionA.id,
      name: "Savings",
      accountNumber: null,
      currencyCode: "USD"
    };
    const {
      institution: institutionB,
      account: accountB,
      transaction: transactionB
    } = await seedOwnerWithAccountAndTransaction(ownerB);
    const snapshotA1 = { id: randomUUID(), accountId: accountA1.id, asOfDate: "2026-01-31", balanceMinor: 100_000 };
    const snapshotA2 = { id: randomUUID(), accountId: accountA2.id, asOfDate: "2026-01-31", balanceMinor: 999 };
    const snapshotB = { id: randomUUID(), accountId: accountB.id, asOfDate: "2026-01-31", balanceMinor: 100_000 };
    const reconA1Id = randomUUID();
    const reconA2Id = randomUUID();
    const reconBId = randomUUID();

    try {
      await new PgAccountRepository(CONNECTION_STRING, ownerA).create(accountA2);
      const snapshotsA = new PgBalanceSnapshotRepository(CONNECTION_STRING, ownerA);
      const snapshotsB = new PgBalanceSnapshotRepository(CONNECTION_STRING, ownerB);
      await snapshotsA.create(snapshotA1);
      await snapshotsA.create(snapshotA2);
      await snapshotsB.create(snapshotB);

      const repoA = new PgReconciliationRepository(CONNECTION_STRING, ownerA);
      const repoB = new PgReconciliationRepository(CONNECTION_STRING, ownerB);
      await repoA.create({
        id: reconA1Id,
        accountId: accountA1.id,
        balanceSnapshotId: snapshotA1.id,
        reconciledAt: "2026-02-01T00:00:00.000Z"
      });
      const mismatched = await repoA.create({
        id: reconA2Id,
        accountId: accountA2.id,
        balanceSnapshotId: snapshotA2.id,
        reconciledAt: "2026-02-02T00:00:00.000Z"
      });
      await repoB.create({
        id: reconBId,
        accountId: accountB.id,
        balanceSnapshotId: snapshotB.id,
        reconciledAt: "2026-02-01T00:00:00.000Z"
      });

      // accountA1 reconciled cleanly (no Discrepancy) and accountB belongs to
      // Owner B, so only accountA2 may appear.
      expect(
        await repoA.countOpenDiscrepanciesByAccountIds([accountA1.id, accountA2.id, accountB.id])
      ).toEqual([{ accountId: accountA2.id, openDiscrepancies: 1 }]);

      const discrepancies = await repoA.listDiscrepanciesByReconciliationIds([reconA1Id, reconA2Id, reconBId]);
      expect(discrepancies).toEqual([
        { id: `${reconA2Id}-discrepancy`, reconciliationId: mismatched.id, amountMinor: 999, resolution: null }
      ]);

      await repoA.resolveDiscrepancy(`${reconA2Id}-discrepancy`, "disputed-with-bank");
      expect(
        await repoA.countOpenDiscrepanciesByAccountIds([accountA1.id, accountA2.id, accountB.id])
      ).toEqual([]);

      expect(await repoA.countOpenDiscrepanciesByAccountIds([])).toEqual([]);
      expect(await repoA.listDiscrepanciesByReconciliationIds([])).toEqual([]);
    } finally {
      await admin`delete from discrepancies where reconciliation_id in (${reconA1Id}, ${reconA2Id}, ${reconBId})`;
      await admin`delete from reconciliations where id in (${reconA1Id}, ${reconA2Id}, ${reconBId})`;
      await admin`delete from balance_snapshots where id in (${snapshotA1.id}, ${snapshotA2.id}, ${snapshotB.id})`;
      await admin`delete from transactions where id in (${transactionA1.id}, ${transactionB.id})`;
      await admin`delete from accounts where id in (${accountA1.id}, ${accountA2.id}, ${accountB.id})`;
      await admin`delete from institutions where id in (${institutionA.id}, ${institutionB.id})`;
    }
  });

  it("throws when creating a Reconciliation against an unknown BalanceSnapshot", async () => {
    const ownerId = randomUUID();
    const { institution, account, transaction } = await seedOwnerWithAccountAndTransaction(ownerId);
    const missingSnapshotId = randomUUID();

    try {
      await expect(
        new PgReconciliationRepository(CONNECTION_STRING, ownerId).create({
          id: randomUUID(),
          accountId: account.id,
          balanceSnapshotId: missingSnapshotId,
          reconciledAt: "2026-02-01T00:00:00.000Z"
        })
      ).rejects.toBeInstanceOf(BalanceSnapshotNotFoundError);
    } finally {
      await admin`delete from transactions where id = ${transaction.id}`;
      await admin`delete from accounts where id = ${account.id}`;
      await admin`delete from institutions where id = ${institution.id}`;
    }
  });

  it("listAdjustmentLinksByAccountId() maps Adjustment Transactions to Reconciliations, scoped to the calling Owner", async () => {
    const ownerA = randomUUID();
    const ownerB = randomUUID();
    const {
      institution: institutionA,
      account: accountA,
      transaction: transactionA
    } = await seedOwnerWithAccountAndTransaction(ownerA);
    const {
      institution: institutionB,
      account: accountB,
      transaction: transactionB
    } = await seedOwnerWithAccountAndTransaction(ownerB);
    const snapshotA = { id: randomUUID(), accountId: accountA.id, asOfDate: "2026-01-31", balanceMinor: 120_000 };
    const snapshotB = { id: randomUUID(), accountId: accountB.id, asOfDate: "2026-01-31", balanceMinor: 120_000 };
    const reconAId = randomUUID();
    const reconBId = randomUUID();
    const adjustmentTxnAId = randomUUID();
    const adjustmentTxnBId = randomUUID();

    try {
      await new PgBalanceSnapshotRepository(CONNECTION_STRING, ownerA).create(snapshotA);
      await new PgBalanceSnapshotRepository(CONNECTION_STRING, ownerB).create(snapshotB);

      const repoA = new PgReconciliationRepository(CONNECTION_STRING, ownerA);
      const repoB = new PgReconciliationRepository(CONNECTION_STRING, ownerB);
      await repoA.create({
        id: reconAId,
        accountId: accountA.id,
        balanceSnapshotId: snapshotA.id,
        reconciledAt: "2026-02-01T00:00:00.000Z"
      });
      await repoB.create({
        id: reconBId,
        accountId: accountB.id,
        balanceSnapshotId: snapshotB.id,
        reconciledAt: "2026-02-01T00:00:00.000Z"
      });
      await repoA.resolveWithAdjustment(`${reconAId}-discrepancy`, {
        id: adjustmentTxnAId,
        accountId: accountA.id,
        amountMinor: 20_000,
        occurredAt: "2026-02-01T00:00:00.000Z",
        description: "Owner correction"
      });
      await repoB.resolveWithAdjustment(`${reconBId}-discrepancy`, {
        id: adjustmentTxnBId,
        accountId: accountB.id,
        amountMinor: 20_000,
        occurredAt: "2026-02-01T00:00:00.000Z",
        description: "Owner correction"
      });

      expect(await repoA.listAdjustmentLinksByAccountId(accountA.id)).toEqual([
        { transactionId: adjustmentTxnAId, reconciliationId: reconAId }
      ]);
      // Owner B's Account id is a real row; the owner predicate, not the
      // accountId predicate alone, is what must exclude it.
      expect(await repoA.listAdjustmentLinksByAccountId(accountB.id)).toEqual([]);
    } finally {
      await admin`delete from adjustments where transaction_id in (${adjustmentTxnAId}, ${adjustmentTxnBId})`;
      await admin`delete from discrepancies where reconciliation_id in (${reconAId}, ${reconBId})`;
      await admin`delete from reconciliations where id in (${reconAId}, ${reconBId})`;
      await admin`delete from balance_snapshots where id in (${snapshotA.id}, ${snapshotB.id})`;
      await admin`delete from transactions where id in (${transactionA.id}, ${transactionB.id}, ${adjustmentTxnAId}, ${adjustmentTxnBId})`;
      await admin`delete from accounts where id in (${accountA.id}, ${accountB.id})`;
      await admin`delete from institutions where id in (${institutionA.id}, ${institutionB.id})`;
    }
  });
});
