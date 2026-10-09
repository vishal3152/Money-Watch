import { describe, expect, it, vi } from "vitest";

import { dismissSuspectedDuplicate, type DismissDuplicateState } from "@/app/imports/[id]/dismiss-duplicate-actions";
import { AccountRepository } from "@/db/repositories/account-repository";
import { InstitutionRepository } from "@/db/repositories/institution-repository";
import { TransactionRepository } from "@/db/repositories/transaction-repository";
import { createTestDb } from "@/db/repositories/test-db";

async function seedFlaggedTransaction(testDb: ReturnType<typeof createTestDb>) {
  await new InstitutionRepository(testDb.db).create({ id: "inst-1", name: "Bank One" });
  await new AccountRepository(testDb.db).create({
    id: "acc-1",
    institutionId: "inst-1",
    name: "Primary Checking",
    accountNumber: null,
    currencyCode: "INR"
  });
  const transactionRepository = new TransactionRepository(testDb.db);
  await transactionRepository.create({
    id: "original-txn",
    accountId: "acc-1",
    amountMinor: -1_500_00,
    occurredAt: "2026-01-15T00:00:00.000Z",
    description: "Grocery run",
    trustStatus: "Confirmed",
    transferId: null,
    category: "Grocery",
    importBatchId: null
  });
  await transactionRepository.create({
    id: "flagged-txn",
    accountId: "acc-1",
    amountMinor: -1_500_00,
    occurredAt: "2026-01-15T00:00:00.000Z",
    description: "Grocery run [REF]",
    trustStatus: "Imported",
    transferId: null,
    category: "Grocery",
    importBatchId: null,
    possibleDuplicateOfTransactionId: "original-txn"
  });
  return transactionRepository;
}

function formData(transactionId: string, batchId: string): FormData {
  const data = new FormData();
  data.set("transactionId", transactionId);
  data.set("batchId", batchId);
  return data;
}

describe("dismissSuspectedDuplicate", () => {
  it("clears the flag and redirects back to the import batch review page", async () => {
    const testDb = createTestDb();
    const transactionRepository = await seedFlaggedTransaction(testDb);
    const redirectTo = vi.fn();

    const result = await dismissSuspectedDuplicate(
      {} as DismissDuplicateState,
      formData("flagged-txn", "batch-1"),
      { db: testDb.db, redirectTo }
    );

    expect(result).toEqual({});
    expect((await transactionRepository.getById("flagged-txn"))?.possibleDuplicateOfTransactionId).toBeNull();
    expect(redirectTo).toHaveBeenCalledWith("/imports/batch-1");
  });

  it("returns a form error and does not redirect for an unknown transaction id", async () => {
    const testDb = createTestDb();
    const redirectTo = vi.fn();

    const result = await dismissSuspectedDuplicate(
      {} as DismissDuplicateState,
      formData("missing-txn", "batch-1"),
      { db: testDb.db, redirectTo }
    );

    expect(result.formError).toBeDefined();
    expect(redirectTo).not.toHaveBeenCalled();
  });
});
