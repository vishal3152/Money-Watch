import { describe, expect, it, vi } from "vitest";

import { confirmImportBatch, type ConfirmImportBatchState } from "@/app/imports/[id]/confirm-actions";
import { AccountRepository } from "@/db/repositories/account-repository";
import { ImportBatchRepository } from "@/db/repositories/import-batch-repository";
import { InstitutionRepository } from "@/db/repositories/institution-repository";
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

describe("confirmImportBatch", () => {
  it("confirms an unconfirmed batch and redirects to its review page", async () => {
    const testDb = createTestDb();
    const repository = await seedBatch(testDb);
    const redirectTo = vi.fn();

    const result = await confirmImportBatch({} as ConfirmImportBatchState, formDataWithBatchId("batch-1"), {
      db: testDb.db,
      redirectTo
    });

    expect(result).toEqual({});
    expect((await repository.getById("batch-1"))?.confirmedAt).not.toBeNull();
    const [transaction] = await new TransactionRepository(testDb.db).listByAccountId("acc-1");
    expect(transaction?.trustStatus).toBe("Confirmed");
    expect(redirectTo).toHaveBeenCalledWith("/imports/batch-1");
  });

  it("returns a form error and does not redirect for an unknown batch id", async () => {
    const testDb = createTestDb();
    const redirectTo = vi.fn();

    const result = await confirmImportBatch({} as ConfirmImportBatchState, formDataWithBatchId("missing-batch"), {
      db: testDb.db,
      redirectTo
    });

    expect(result.formError).toBeDefined();
    expect(redirectTo).not.toHaveBeenCalled();
  });

  it("returns a form error and does not redirect for an already-confirmed batch", async () => {
    const testDb = createTestDb();
    const repository = await seedBatch(testDb);
    await repository.confirmAll("batch-1");
    const redirectTo = vi.fn();

    const result = await confirmImportBatch({} as ConfirmImportBatchState, formDataWithBatchId("batch-1"), {
      db: testDb.db,
      redirectTo
    });

    expect(result.formError).toBeDefined();
    expect(redirectTo).not.toHaveBeenCalled();
  });

  it("returns a form error and does not redirect when a batch Transaction still carries a Suspected Duplicate flag", async () => {
    const testDb = createTestDb();
    await new InstitutionRepository(testDb.db).create({ id: "inst-1", name: "Bank One" });
    await new AccountRepository(testDb.db).create({
      id: "acc-1",
      institutionId: "inst-1",
      name: "Primary Checking",
      accountNumber: null,
      currencyCode: "INR"
    });
    await new TransactionRepository(testDb.db).create({
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
      [{ id: "txn-1", amount: "-1500.00", occurredAt: "2026-01-15", description: "Grocery run", category: "Grocery" }]
    );
    const redirectTo = vi.fn();

    const result = await confirmImportBatch({} as ConfirmImportBatchState, formDataWithBatchId("batch-1"), {
      db: testDb.db,
      redirectTo
    });

    expect(result.formError).toBeDefined();
    expect(redirectTo).not.toHaveBeenCalled();
    expect((await repository.getById("batch-1"))?.confirmedAt).toBeNull();
  });
});
