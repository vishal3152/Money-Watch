import { describe, expect, it } from "vitest";

import { AccountRepository } from "@/db/repositories/account-repository";
import { InstitutionRepository } from "@/db/repositories/institution-repository";
import { createTestDb } from "@/db/repositories/test-db";
import { TransactionRepository } from "@/db/repositories/transaction-repository";
import { InvalidEmailAlertError, type ParsedEmailAlert } from "@/domain/email-alert";
import { createEmailAlertImportBatch } from "@/email-sync/create-email-alert-import-batch";

function deps(testDb: ReturnType<typeof createTestDb>) {
  return { getCurrentOwnerId: async () => null, isCloudMode: () => false, db: testDb.db };
}

async function seedAccount(testDb: ReturnType<typeof createTestDb>) {
  await new InstitutionRepository(testDb.db).create({ id: "inst-1", name: "RBL Bank" });
  await new AccountRepository(testDb.db).create({
    id: "acc-1",
    institutionId: "inst-1",
    name: "Savings",
    accountNumber: "XXXX1602",
    currencyCode: "INR"
  });
}

const rblCreditAlert: ParsedEmailAlert = {
  direction: "credit",
  amount: "1282.05",
  currencyCode: "INR",
  occurredAt: "2026-09-09",
  accountNumberSuffix: "1602",
  institutionName: "RBL Bank",
  description: "NEFT/IN22625213464969/CENTRAL DEPOSITORY SERVICES",
  reference: "NEFT/IN22625213464969",
  balance: "468531.58"
};

describe("createEmailAlertImportBatch", () => {
  it("creates an unconfirmed ImportBatch with source 'email' and one Imported Transaction", async () => {
    const testDb = createTestDb();
    await seedAccount(testDb);
    let idCount = 0;

    const batch = await createEmailAlertImportBatch(rblCreditAlert, "acc-1", {
      ...deps(testDb),
      newId: () => `id-${++idCount}`
    });

    expect(batch.source).toBe("email");
    expect(batch.accountId).toBe("acc-1");
    expect(batch.confirmedAt).toBeNull();
    // Never stashed, even though the alert claims one — see createEmailAlertImportBatch's comment:
    // a single alert's balance is not reliably the account's end-of-day balance.
    expect(batch.closingBalanceMinor).toBeNull();
    expect(batch.asOfDate).toBeNull();

    const transactions = await new TransactionRepository(testDb.db).listByAccountId("acc-1");
    expect(transactions).toEqual([
      expect.objectContaining({
        amountMinor: 1_282_05,
        description: "NEFT/IN22625213464969/CENTRAL DEPOSITORY SERVICES",
        trustStatus: "Imported",
        importBatchId: batch.id
      })
    ]);
  });

  it("makes a debit alert's Transaction amount negative", async () => {
    const testDb = createTestDb();
    await seedAccount(testDb);

    const batch = await createEmailAlertImportBatch(
      { ...rblCreditAlert, direction: "debit" },
      "acc-1",
      deps(testDb)
    );

    const transactions = await new TransactionRepository(testDb.db).listByAccountId("acc-1");
    expect(transactions[0].amountMinor).toBe(-1_282_05);
    expect(batch.closingBalanceMinor).toBeNull();
    expect(batch.asOfDate).toBeNull();
  });

  it("rejects when the alert currency does not match the Account currency", async () => {
    const testDb = createTestDb();
    await seedAccount(testDb);

    await expect(
      createEmailAlertImportBatch({ ...rblCreditAlert, currencyCode: "USD" }, "acc-1", deps(testDb))
    ).rejects.toThrow(InvalidEmailAlertError);

    expect(await new TransactionRepository(testDb.db).listByAccountId("acc-1")).toEqual([]);
  });
});
