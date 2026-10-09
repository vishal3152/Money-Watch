import { describe, expect, it, vi } from "vitest";

import type { DeleteFormState } from "@/app/components/delete-confirm-form";
import { deleteImportBatch, undoConfirmedImportBatch } from "@/app/imports/[id]/delete-actions";
import { AccountRepository } from "@/db/repositories/account-repository";
import { ImportBatchRepository } from "@/db/repositories/import-batch-repository";
import { InstitutionRepository } from "@/db/repositories/institution-repository";
import { ReconciliationRepository } from "@/db/repositories/reconciliation-repository";
import { TransactionRepository } from "@/db/repositories/transaction-repository";
import { createTestDb } from "@/db/repositories/test-db";

async function seedBatch(testDb: ReturnType<typeof createTestDb>) {
  await new InstitutionRepository(testDb.db).create({ id: "inst-1", name: "Bank One" });
  await new AccountRepository(testDb.db).create({
    id: "acc-1",
    institutionId: "inst-1",
    name: "Primary Checking",
    accountNumber: null,
    currencyCode: "INR"
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
  return repository;
}

function formDataWithBatchId(batchId: string): FormData {
  const formData = new FormData();
  formData.set("batchId", batchId);
  return formData;
}

describe("deleteImportBatch", () => {
  it("deletes an unconfirmed batch and its Transactions, then redirects to the imports list", async () => {
    const testDb = createTestDb();
    const repository = await seedBatch(testDb);
    const redirectTo = vi.fn();

    const result = await deleteImportBatch({} as DeleteFormState, formDataWithBatchId("batch-1"), {
      db: testDb.db,
      redirectTo
    });

    expect(result).toEqual({});
    expect(await repository.getById("batch-1")).toBeNull();
    expect(await new TransactionRepository(testDb.db).listByAccountId("acc-1")).toEqual([]);
    expect(redirectTo).toHaveBeenCalledWith("/imports");
  });

  it("returns a form error and does not delete an already-confirmed batch", async () => {
    const testDb = createTestDb();
    const repository = await seedBatch(testDb);
    await repository.confirmAll("batch-1");
    const redirectTo = vi.fn();

    const result = await deleteImportBatch({} as DeleteFormState, formDataWithBatchId("batch-1"), {
      db: testDb.db,
      redirectTo
    });

    expect(result.formError).toBeDefined();
    expect(await repository.getById("batch-1")).not.toBeNull();
    expect(redirectTo).not.toHaveBeenCalled();
  });
});

describe("undoConfirmedImportBatch", () => {
  it("undoes a confirmed batch and redirects to the imports list", async () => {
    const testDb = createTestDb();
    const repository = await seedBatch(testDb);
    await repository.confirmAll("batch-1");
    const redirectTo = vi.fn();

    const result = await undoConfirmedImportBatch({} as DeleteFormState, formDataWithBatchId("batch-1"), {
      db: testDb.db,
      redirectTo
    });

    expect(result).toEqual({});
    expect(await repository.getById("batch-1")).toBeNull();
    expect(redirectTo).toHaveBeenCalledWith("/imports");
  });

  it("returns a form error and does not undo an unconfirmed batch", async () => {
    const testDb = createTestDb();
    const repository = await seedBatch(testDb);
    const redirectTo = vi.fn();

    const result = await undoConfirmedImportBatch({} as DeleteFormState, formDataWithBatchId("batch-1"), {
      db: testDb.db,
      redirectTo
    });

    expect(result.formError).toBeDefined();
    expect(await repository.getById("batch-1")).not.toBeNull();
    expect(redirectTo).not.toHaveBeenCalled();
  });

  it("returns a form error and does not undo when the Reconciliation already has an Adjustment", async () => {
    const testDb = createTestDb();
    await new InstitutionRepository(testDb.db).create({ id: "inst-1", name: "Bank One" });
    await new AccountRepository(testDb.db).create({
      id: "acc-1",
      institutionId: "inst-1",
      name: "Primary Checking",
      accountNumber: null,
      currencyCode: "INR"
    });
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
    await new ReconciliationRepository(testDb.db).resolveWithAdjustment(
      `${confirmed.reconciliationId}-discrepancy`,
      {
        id: "adj-txn-1",
        accountId: "acc-1",
        amountMinor: 10_000_00,
        occurredAt: "2026-02-01T00:00:00.000Z",
        description: "Adjustment"
      }
    );
    const redirectTo = vi.fn();

    const result = await undoConfirmedImportBatch({} as DeleteFormState, formDataWithBatchId("batch-1"), {
      db: testDb.db,
      redirectTo
    });

    expect(result.formError).toBeDefined();
    expect(await repository.getById("batch-1")).not.toBeNull();
    expect(redirectTo).not.toHaveBeenCalled();
  });
});
