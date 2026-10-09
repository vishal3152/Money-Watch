import { randomUUID } from "node:crypto";

import postgres from "postgres";
import { describe, expect, it, vi } from "vitest";

import {
  reconcileAccount,
  type ReconciliationFormState
} from "@/app/accounts/[id]/reconcile/actions";
import { PgAccountRepository } from "@/db/postgres/repositories/account-repository";
import { PgInstitutionRepository } from "@/db/postgres/repositories/institution-repository";
import { PgReconciliationRepository } from "@/db/postgres/repositories/reconciliation-repository";
import { PgTransactionRepository } from "@/db/postgres/repositories/transaction-repository";
import { AccountRepository } from "@/db/repositories/account-repository";
import { InstitutionRepository } from "@/db/repositories/institution-repository";
import { ReconciliationRepository } from "@/db/repositories/reconciliation-repository";
import { TransactionRepository } from "@/db/repositories/transaction-repository";
import { createTestDb } from "@/db/repositories/test-db";

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

function reconciliationFormData(balance: string) {
  const formData = new FormData();
  formData.set("accountId", "acc-1");
  formData.set("balance", balance);
  formData.set("asOfDate", "2026-01-31");
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
  return testDb;
}

describe("reconcileAccount", () => {
  it("rejects an invalid reported balance without writing", async () => {
    const testDb = await seedAccount();
    const result = await reconcileAccount(
      {} as ReconciliationFormState,
      reconciliationFormData("1000.001"),
      { db: testDb.db, redirectTo: vi.fn(), newId: vi.fn() }
    );

    expect(result.fieldErrors?.balance).toEqual({ key: "errors.reportedBalanceInvalid" });
    expect(await new ReconciliationRepository(testDb.db).listByAccountId("acc-1")).toEqual([]);
  });

  it("persists a matching Reconciliation without a Discrepancy", async () => {
    const testDb = await seedAccount();
    const ids = ["snapshot-1", "reconciliation-1"];
    const redirectTo = vi.fn();
    const result = await reconcileAccount(
      {} as ReconciliationFormState,
      reconciliationFormData("1000.00"),
      {
        db: testDb.db,
        redirectTo,
        newId: () => ids.shift()!,
        now: () => "2026-02-01T00:00:00.000Z"
      }
    );
    const reconciliations = new ReconciliationRepository(testDb.db);

    expect(result).toEqual({});
    expect(await reconciliations.getById("reconciliation-1")).toMatchObject({
      balanceSnapshotId: "snapshot-1",
      computedBalanceMinor: 100_000
    });
    expect(
      await reconciliations.getDiscrepancyByReconciliationId("reconciliation-1")
    ).toBeNull();
    expect(redirectTo).toHaveBeenCalledWith("/reconciliations/reconciliation-1");
  });

  it("persists the signed Discrepancy for a mismatched balance", async () => {
    const testDb = await seedAccount();
    const ids = ["snapshot-1", "reconciliation-1"];
    await reconcileAccount(
      {} as ReconciliationFormState,
      reconciliationFormData("1050.00"),
      {
        db: testDb.db,
        redirectTo: vi.fn(),
        newId: () => ids.shift()!,
        now: () => "2026-02-01T00:00:00.000Z"
      }
    );

    expect(
      await new ReconciliationRepository(testDb.db).getDiscrepancyByReconciliationId(
        "reconciliation-1"
      )
    ).toMatchObject({ amountMinor: 5_000, resolution: null });
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
    const ids = [randomUUID(), randomUUID()];
    const [snapshotId, reconciliationId] = ids;
    const redirectTo = vi.fn();
    const formData = new FormData();
    formData.set("accountId", account.id);
    formData.set("balance", "1000.00");
    formData.set("asOfDate", "2026-01-31");

    try {
      const result = await reconcileAccount({} as ReconciliationFormState, formData, {
        getCurrentOwnerId: async () => ownerId,
        isCloudMode: () => true,
        postgresConnectionString: TEST_DATABASE_URL,
        redirectTo,
        newId: () => ids.shift()!,
        now: () => "2026-02-01T00:00:00.000Z"
      });

      expect(result).toEqual({});
      const pgReconciliations = new PgReconciliationRepository(TEST_DATABASE_URL, ownerId);
      expect(await pgReconciliations.getById(reconciliationId)).toMatchObject({
        balanceSnapshotId: snapshotId,
        computedBalanceMinor: 100_000
      });
      expect(redirectTo).toHaveBeenCalledWith(`/reconciliations/${reconciliationId}`);
    } finally {
      const admin = postgres(TEST_DATABASE_URL, { max: 1 });
      await admin`delete from reconciliations where id = ${reconciliationId}`;
      await admin`delete from balance_snapshots where id = ${snapshotId}`;
      await admin`delete from transactions where account_id = ${account.id}`;
      await admin`delete from accounts where id = ${account.id}`;
      await admin`delete from institutions where id = ${institution.id}`;
      await admin.end();
    }
  });
});
