import { randomUUID } from "node:crypto";

import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";

import { PgAccountRepository } from "@/db/postgres/repositories/account-repository";
import { PgAdjustmentRepository } from "@/db/postgres/repositories/adjustment-repository";
import { PgBalanceSnapshotRepository } from "@/db/postgres/repositories/balance-snapshot-repository";
import { PgInstitutionRepository } from "@/db/postgres/repositories/institution-repository";
import { PgReconciliationRepository } from "@/db/postgres/repositories/reconciliation-repository";
import { PgTransactionRepository } from "@/db/postgres/repositories/transaction-repository";

const CONNECTION_STRING =
  process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

const admin = postgres(CONNECTION_STRING, { max: 1 });

afterAll(async () => {
  await admin.end();
});

async function seedOwnerWithDiscrepancy(ownerId: string) {
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
  const snapshot = {
    id: randomUUID(),
    accountId: account.id,
    asOfDate: "2026-01-31",
    balanceMinor: 105_000
  };
  const reconciliationId = randomUUID();

  await new PgInstitutionRepository(CONNECTION_STRING, ownerId).create(institution);
  await new PgAccountRepository(CONNECTION_STRING, ownerId).create(account);
  await new PgTransactionRepository(CONNECTION_STRING, ownerId).create(transaction);
  await new PgBalanceSnapshotRepository(CONNECTION_STRING, ownerId).create(snapshot);
  await new PgReconciliationRepository(CONNECTION_STRING, ownerId).create({
    id: reconciliationId,
    accountId: account.id,
    balanceSnapshotId: snapshot.id,
    reconciledAt: "2026-02-01T00:00:00.000Z"
  });

  return {
    institution,
    account,
    transaction,
    snapshot,
    reconciliationId,
    discrepancyId: `${reconciliationId}-discrepancy`
  };
}

describe("PgAdjustmentRepository", () => {
  it("persists an Adjustment's Transaction and returns scoped lookup results", async () => {
    const ownerA = randomUUID();
    const ownerB = randomUUID();
    const ownerAFixture = await seedOwnerWithDiscrepancy(ownerA);
    const ownerBFixture = await seedOwnerWithDiscrepancy(ownerB);
    const adjustmentTransaction = {
      id: randomUUID(),
      accountId: ownerAFixture.account.id,
      amountMinor: 5_000,
      occurredAt: "2026-02-01T00:00:00.000Z",
      description: "Owner correction for missed deposit"
    };

    try {
      const repoA = new PgAdjustmentRepository(CONNECTION_STRING, ownerA);

      const adjustment = await repoA.create(adjustmentTransaction, ownerAFixture.discrepancyId);

      expect(adjustment).toEqual({
        id: `${adjustmentTransaction.id}-adjustment`,
        transactionId: adjustmentTransaction.id,
        discrepancyId: ownerAFixture.discrepancyId
      });
      expect(await repoA.getByDiscrepancyId(ownerAFixture.discrepancyId)).toEqual(adjustment);
      expect(await repoA.getByDiscrepancyId(ownerBFixture.discrepancyId)).toBeNull();
      expect(await repoA.getByTransactionId(adjustmentTransaction.id)).toEqual(adjustment);
      expect(await repoA.getByTransactionId(ownerAFixture.transaction.id)).toBeNull();
      expect(await new PgTransactionRepository(CONNECTION_STRING, ownerA).listByAccountId(ownerAFixture.account.id))
        .toContainEqual({
          id: adjustmentTransaction.id,
          accountId: ownerAFixture.account.id,
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
    } finally {
      await admin`delete from adjustments where transaction_id = ${adjustmentTransaction.id}`;
      await admin`delete from transactions where id = ${adjustmentTransaction.id}`;
      await admin`delete from discrepancies where reconciliation_id in (${ownerAFixture.reconciliationId}, ${ownerBFixture.reconciliationId})`;
      await admin`delete from reconciliations where id in (${ownerAFixture.reconciliationId}, ${ownerBFixture.reconciliationId})`;
      await admin`delete from balance_snapshots where id in (${ownerAFixture.snapshot.id}, ${ownerBFixture.snapshot.id})`;
      await admin`delete from transactions where id in (${ownerAFixture.transaction.id}, ${ownerBFixture.transaction.id})`;
      await admin`delete from accounts where id in (${ownerAFixture.account.id}, ${ownerBFixture.account.id})`;
      await admin`delete from institutions where id in (${ownerAFixture.institution.id}, ${ownerBFixture.institution.id})`;
    }
  });

  it("rolls back the Adjustment Transaction when the Discrepancy does not exist", async () => {
    const ownerId = randomUUID();
    const institution = { id: randomUUID(), name: "Bank" };
    const account = {
      id: randomUUID(),
      institutionId: institution.id,
      name: "Checking",
      accountNumber: null,
      currencyCode: "USD"
    };
    const adjustmentTransaction = {
      id: randomUUID(),
      accountId: account.id,
      amountMinor: 5_000,
      occurredAt: "2026-02-01T00:00:00.000Z",
      description: "Owner correction"
    };

    try {
      await new PgInstitutionRepository(CONNECTION_STRING, ownerId).create(institution);
      await new PgAccountRepository(CONNECTION_STRING, ownerId).create(account);

      await expect(
        new PgAdjustmentRepository(CONNECTION_STRING, ownerId).create(adjustmentTransaction, "missing-discrepancy")
      ).rejects.toThrow();

      expect(await new PgTransactionRepository(CONNECTION_STRING, ownerId).listByAccountId(account.id)).toEqual([]);
    } finally {
      await admin`delete from transactions where id = ${adjustmentTransaction.id}`;
      await admin`delete from accounts where id = ${account.id}`;
      await admin`delete from institutions where id = ${institution.id}`;
    }
  });

  it("finds several Transactions' Adjustments in one call, scoped to the calling Owner", async () => {
    const ownerA = randomUUID();
    const ownerB = randomUUID();
    const ownerAFixture = await seedOwnerWithDiscrepancy(ownerA);
    const ownerBFixture = await seedOwnerWithDiscrepancy(ownerB);
    const adjustmentTransactionA = {
      id: randomUUID(),
      accountId: ownerAFixture.account.id,
      amountMinor: 5_000,
      occurredAt: "2026-02-01T00:00:00.000Z",
      description: "Owner A correction"
    };
    const adjustmentTransactionB = {
      id: randomUUID(),
      accountId: ownerBFixture.account.id,
      amountMinor: 5_000,
      occurredAt: "2026-02-01T00:00:00.000Z",
      description: "Owner B correction"
    };

    try {
      const repoA = new PgAdjustmentRepository(CONNECTION_STRING, ownerA);
      const adjustmentA = await repoA.create(adjustmentTransactionA, ownerAFixture.discrepancyId);
      await new PgAdjustmentRepository(CONNECTION_STRING, ownerB).create(
        adjustmentTransactionB,
        ownerBFixture.discrepancyId
      );

      expect(
        await repoA.listByTransactionIds([
          ownerAFixture.transaction.id,
          adjustmentTransactionA.id,
          adjustmentTransactionB.id
        ])
      ).toEqual([adjustmentA]);
      expect(await repoA.listByTransactionIds([])).toEqual([]);
    } finally {
      await admin`delete from adjustments where transaction_id in (${adjustmentTransactionA.id}, ${adjustmentTransactionB.id})`;
      await admin`delete from transactions where id in (${adjustmentTransactionA.id}, ${adjustmentTransactionB.id})`;
      await admin`delete from discrepancies where reconciliation_id in (${ownerAFixture.reconciliationId}, ${ownerBFixture.reconciliationId})`;
      await admin`delete from reconciliations where id in (${ownerAFixture.reconciliationId}, ${ownerBFixture.reconciliationId})`;
      await admin`delete from balance_snapshots where id in (${ownerAFixture.snapshot.id}, ${ownerBFixture.snapshot.id})`;
      await admin`delete from transactions where id in (${ownerAFixture.transaction.id}, ${ownerBFixture.transaction.id})`;
      await admin`delete from accounts where id in (${ownerAFixture.account.id}, ${ownerBFixture.account.id})`;
      await admin`delete from institutions where id in (${ownerAFixture.institution.id}, ${ownerBFixture.institution.id})`;
    }
  });

  it("rejects an Adjustment referencing another Owner's Discrepancy, even though the id exists", async () => {
    const ownerA = randomUUID();
    const ownerB = randomUUID();
    const ownerBFixture = await seedOwnerWithDiscrepancy(ownerB);
    const institutionA = { id: randomUUID(), name: "Bank A" };
    const accountA = {
      id: randomUUID(),
      institutionId: institutionA.id,
      name: "Checking",
      accountNumber: null,
      currencyCode: "USD"
    };
    const adjustmentTransaction = {
      id: randomUUID(),
      accountId: accountA.id,
      amountMinor: 5_000,
      occurredAt: "2026-02-01T00:00:00.000Z",
      description: "Cross-owner attempt"
    };

    try {
      await new PgInstitutionRepository(CONNECTION_STRING, ownerA).create(institutionA);
      await new PgAccountRepository(CONNECTION_STRING, ownerA).create(accountA);

      await expect(
        new PgAdjustmentRepository(CONNECTION_STRING, ownerA).create(
          adjustmentTransaction,
          ownerBFixture.discrepancyId
        )
      ).rejects.toThrow();

      expect(await new PgTransactionRepository(CONNECTION_STRING, ownerA).listByAccountId(accountA.id)).toEqual([]);
    } finally {
      await admin`delete from transactions where id = ${adjustmentTransaction.id}`;
      await admin`delete from accounts where id = ${accountA.id}`;
      await admin`delete from institutions where id = ${institutionA.id}`;
      await admin`delete from discrepancies where reconciliation_id = ${ownerBFixture.reconciliationId}`;
      await admin`delete from reconciliations where id = ${ownerBFixture.reconciliationId}`;
      await admin`delete from balance_snapshots where id = ${ownerBFixture.snapshot.id}`;
      await admin`delete from transactions where id = ${ownerBFixture.transaction.id}`;
      await admin`delete from accounts where id = ${ownerBFixture.account.id}`;
      await admin`delete from institutions where id = ${ownerBFixture.institution.id}`;
    }
  });
});
