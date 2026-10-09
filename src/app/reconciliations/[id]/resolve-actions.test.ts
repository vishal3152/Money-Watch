import { randomUUID } from "node:crypto";

import postgres from "postgres";
import { describe, expect, it, vi } from "vitest";

import {
  resolveDiscrepancy,
  type ResolveDiscrepancyFormState
} from "@/app/reconciliations/[id]/resolve-actions";
import { PgAccountRepository } from "@/db/postgres/repositories/account-repository";
import { PgAdjustmentRepository } from "@/db/postgres/repositories/adjustment-repository";
import { PgBalanceSnapshotRepository } from "@/db/postgres/repositories/balance-snapshot-repository";
import { PgInstitutionRepository } from "@/db/postgres/repositories/institution-repository";
import { PgReconciliationRepository } from "@/db/postgres/repositories/reconciliation-repository";
import { PgTransactionRepository } from "@/db/postgres/repositories/transaction-repository";
import { AccountRepository } from "@/db/repositories/account-repository";
import { AdjustmentRepository } from "@/db/repositories/adjustment-repository";
import { BalanceSnapshotRepository } from "@/db/repositories/balance-snapshot-repository";
import { InstitutionRepository } from "@/db/repositories/institution-repository";
import { ReconciliationRepository } from "@/db/repositories/reconciliation-repository";
import { TransactionRepository } from "@/db/repositories/transaction-repository";
import { createTestDb } from "@/db/repositories/test-db";

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

function resolutionFormData(resolution: string, includeAdjustment = true) {
  const formData = new FormData();
  formData.set("reconciliationId", "recon-1");
  formData.set("discrepancyId", "recon-1-discrepancy");
  formData.set("resolution", resolution);
  if (includeAdjustment) {
    formData.set("amount", "50.00");
    formData.set("description", "Missed bank credit");
  }
  return formData;
}

async function seedDiscrepancy() {
  const testDb = createTestDb();
  await new InstitutionRepository(testDb.db).create({ id: "inst-1", name: "Institution One" });
  await new AccountRepository(testDb.db).create({
    id: "acc-1",
    institutionId: "inst-1",
    name: "Everyday account",
    accountNumber: null,
    currencyCode: "INR"
  });
  await new TransactionRepository(testDb.db).create({
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
  await new BalanceSnapshotRepository(testDb.db).create({
    id: "snap-1",
    accountId: "acc-1",
    asOfDate: "2026-01-31",
    balanceMinor: 105_000
  });
  await new ReconciliationRepository(testDb.db).create({
    id: "recon-1",
    accountId: "acc-1",
    balanceSnapshotId: "snap-1",
    reconciledAt: "2026-02-01T00:00:00.000Z"
  });
  return testDb;
}

describe("resolveDiscrepancy", () => {
  it("persists disputed-with-bank without an Adjustment", async () => {
    const testDb = await seedDiscrepancy();
    const result = await resolveDiscrepancy(
      {} as ResolveDiscrepancyFormState,
      resolutionFormData("disputed-with-bank", false),
      { db: testDb.db, refresh: vi.fn() }
    );

    expect(result).toEqual({ success: true });
    expect(
      await new ReconciliationRepository(testDb.db).getDiscrepancyByReconciliationId("recon-1")
    ).toMatchObject({ resolution: "disputed-with-bank" });
    expect(
      await new AdjustmentRepository(testDb.db).getByDiscrepancyId("recon-1-discrepancy")
    ).toBeNull();
  });

  it("rejects corrected-my-record without Adjustment details before writing", async () => {
    const testDb = await seedDiscrepancy();
    const result = await resolveDiscrepancy(
      {} as ResolveDiscrepancyFormState,
      resolutionFormData("corrected-my-record", false),
      { db: testDb.db, refresh: vi.fn(), newId: () => "adj-txn-1" }
    );

    expect(result.formError).toEqual({ key: "errors.adjustmentFieldsRequired" });
    expect(
      await new ReconciliationRepository(testDb.db).getDiscrepancyByReconciliationId("recon-1")
    ).toMatchObject({ resolution: null });
    expect(await new TransactionRepository(testDb.db).listByAccountId("acc-1")).toHaveLength(1);
  });

  it("atomically persists corrected-my-record with its Adjustment", async () => {
    const testDb = await seedDiscrepancy();
    const result = await resolveDiscrepancy(
      {} as ResolveDiscrepancyFormState,
      resolutionFormData("corrected-my-record"),
      {
        db: testDb.db,
        refresh: vi.fn(),
        newId: () => "adj-txn-1",
        now: () => "2026-02-01T00:00:00.000Z"
      }
    );

    expect(result).toEqual({ success: true });
    expect(
      await new ReconciliationRepository(testDb.db).getDiscrepancyByReconciliationId("recon-1")
    ).toMatchObject({ resolution: "corrected-my-record" });
    expect(
      await new AdjustmentRepository(testDb.db).getByDiscrepancyId("recon-1-discrepancy")
    ).toEqual({
      id: "adj-txn-1-adjustment",
      transactionId: "adj-txn-1",
      discrepancyId: "recon-1-discrepancy"
    });
  });

  it("returns a friendly formError, not a crash, for a Discrepancy another submission already resolved", async () => {
    const testDb = await seedDiscrepancy();
    const reconciliations = new ReconciliationRepository(testDb.db);
    await reconciliations.resolveDiscrepancy("recon-1-discrepancy", "disputed-with-bank");

    const result = await resolveDiscrepancy(
      {} as ResolveDiscrepancyFormState,
      resolutionFormData("corrected-my-record"),
      {
        db: testDb.db,
        refresh: vi.fn(),
        newId: () => "adj-txn-1",
        now: () => "2026-02-01T00:00:00.000Z"
      }
    );

    expect(result.formError).toEqual({ key: "errors.discrepancyAlreadyResolved" });
    expect(
      await new AdjustmentRepository(testDb.db).getByDiscrepancyId("recon-1-discrepancy")
    ).toBeNull();
  });

  it("resolves through the Postgres repository, scoped to the owner, when an owner is resolved", async () => {
    const ownerId = randomUUID();
    const cloudDeps = {
      getCurrentOwnerId: async () => ownerId,
      isCloudMode: () => true,
      postgresConnectionString: TEST_DATABASE_URL
    };
    const institution = { id: randomUUID(), name: "Cloud Bank" };
    const account = {
      id: randomUUID(),
      institutionId: institution.id,
      name: "Everyday account",
      accountNumber: null,
      currencyCode: "INR"
    };
    const snapshot = {
      id: randomUUID(),
      accountId: account.id,
      asOfDate: "2026-01-31",
      balanceMinor: 105_000
    };
    const reconciliationId = randomUUID();
    await new PgInstitutionRepository(TEST_DATABASE_URL, ownerId).create(institution);
    await new PgAccountRepository(TEST_DATABASE_URL, ownerId).create(account);
    await new PgTransactionRepository(TEST_DATABASE_URL, ownerId).create({
      id: randomUUID(),
      accountId: account.id,
      amountMinor: 100_000,
      occurredAt: "2026-01-10T00:00:00.000Z",
      description: "Deposit",
      trustStatus: "Confirmed",
      transferId: null,
      category: null,
      importBatchId: null
    });
    await new PgBalanceSnapshotRepository(TEST_DATABASE_URL, ownerId).create(snapshot);
    await new PgReconciliationRepository(TEST_DATABASE_URL, ownerId).create({
      id: reconciliationId,
      accountId: account.id,
      balanceSnapshotId: snapshot.id,
      reconciledAt: "2026-02-01T00:00:00.000Z"
    });
    const pgReconciliations = new PgReconciliationRepository(TEST_DATABASE_URL, ownerId);
    const discrepancy = await pgReconciliations.getDiscrepancyByReconciliationId(reconciliationId);
    const formData = new FormData();
    formData.set("reconciliationId", reconciliationId);
    formData.set("discrepancyId", discrepancy!.id);
    formData.set("resolution", "disputed-with-bank");
    const refresh = vi.fn();

    try {
      const result = await resolveDiscrepancy({} as ResolveDiscrepancyFormState, formData, {
        ...cloudDeps,
        refresh
      });

      expect(result).toEqual({ success: true });
      expect(
        await pgReconciliations.getDiscrepancyByReconciliationId(reconciliationId)
      ).toMatchObject({ resolution: "disputed-with-bank" });
      expect(refresh).toHaveBeenCalledWith(`/reconciliations/${reconciliationId}`);
    } finally {
      const admin = postgres(TEST_DATABASE_URL, { max: 1 });
      await admin`delete from discrepancies where id = ${discrepancy!.id}`;
      await admin`delete from reconciliations where id = ${reconciliationId}`;
      await admin`delete from balance_snapshots where id = ${snapshot.id}`;
      await admin`delete from transactions where account_id = ${account.id}`;
      await admin`delete from accounts where id = ${account.id}`;
      await admin`delete from institutions where id = ${institution.id}`;
      await admin.end();
    }
  });
});
