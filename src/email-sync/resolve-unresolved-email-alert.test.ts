import { describe, expect, it } from "vitest";

import { AccountRepository } from "@/db/repositories/account-repository";
import { ImportBatchRepository } from "@/db/repositories/import-batch-repository";
import { InstitutionRepository } from "@/db/repositories/institution-repository";
import { createTestDb } from "@/db/repositories/test-db";
import { TransactionRepository } from "@/db/repositories/transaction-repository";
import { UnresolvedEmailAlertRepository } from "@/db/repositories/unresolved-email-alert-repository";
import { InvalidEmailAlertError, type EmailAlertDraft, type ImportableEmailAlert } from "@/domain/email-alert";
import { createEmailAlertImportBatch } from "@/email-sync/create-email-alert-import-batch";
import { emailAlertImportBatchId, emailAlertTransactionId } from "@/email-sync/email-alert-import-ids";
import {
  EmailAlertNotResolvableError,
  resolveUnresolvedEmailAlert
} from "@/email-sync/resolve-unresolved-email-alert";

function deps(testDb: ReturnType<typeof createTestDb>) {
  return { getCurrentOwnerId: async () => null, isCloudMode: () => false, db: testDb.db };
}

const rblCreditDraft: EmailAlertDraft = {
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

const correctedAlert: ImportableEmailAlert = {
  direction: "credit",
  amount: "1282.05",
  currencyCode: "INR",
  occurredAt: "2026-09-09",
  description: "NEFT/IN22625213464969/CENTRAL DEPOSITORY SERVICES"
};

async function seedUnresolvedAlert(
  testDb: ReturnType<typeof createTestDb>,
  overrides: Partial<Parameters<UnresolvedEmailAlertRepository["save"]>[0]> = {}
) {
  await new InstitutionRepository(testDb.db).create({ id: "inst-1", name: "RBL Bank" });
  await new AccountRepository(testDb.db).create({
    id: "acc-1",
    institutionId: "inst-1",
    name: "Savings",
    accountNumber: "XXXX1602",
    currencyCode: "INR"
  });
  await new UnresolvedEmailAlertRepository(testDb.db).save({
    id: "alert-1",
    mailbox: "inbox@example.com",
    messageUid: "uid-9",
    detectedAt: "2026-09-09T11:00:00.000Z",
    failureReason: "no-match (RBL Bank …1602)",
    draft: rblCreditDraft,
    invalidFields: [],
    ...overrides
  });
}

describe("resolveUnresolvedEmailAlert", () => {
  it("creates an email ImportBatch for the chosen Account and drops the alert from the review queue", async () => {
    const testDb = createTestDb();
    await seedUnresolvedAlert(testDb);

    const batch = await resolveUnresolvedEmailAlert(
      { alertId: "alert-1", accountId: "acc-1", alert: correctedAlert },
      deps(testDb)
    );

    expect(batch.source).toBe("email");
    expect(batch.accountId).toBe("acc-1");
    expect(await new UnresolvedEmailAlertRepository(testDb.db).listAll()).toEqual([]);
    expect(await new TransactionRepository(testDb.db).listByAccountId("acc-1")).toEqual([
      expect.objectContaining({
        amountMinor: 1_282_05,
        description: correctedAlert.description,
        trustStatus: "Imported",
        importBatchId: batch.id
      })
    ]);
    expect(await new ImportBatchRepository(testDb.db).getById(batch.id)).not.toBeNull();
  });

  it("imports the owner's corrections, not what the LLM originally claimed", async () => {
    const testDb = createTestDb();
    await seedUnresolvedAlert(testDb, {
      draft: { ...rblCreditDraft, amount: "INR 1,282.05", direction: "sideways" },
      invalidFields: ["direction", "amount"]
    });

    const batch = await resolveUnresolvedEmailAlert(
      {
        alertId: "alert-1",
        accountId: "acc-1",
        alert: { ...correctedAlert, direction: "debit", amount: "499.50", description: "UPI/P2M/COFFEE" }
      },
      deps(testDb)
    );

    expect(await new TransactionRepository(testDb.db).listByAccountId("acc-1")).toEqual([
      expect.objectContaining({
        amountMinor: -49_950,
        description: "UPI/P2M/COFFEE",
        importBatchId: batch.id
      })
    ]);
  });

  it("refuses an alert that is no longer in the review queue", async () => {
    const testDb = createTestDb();
    await seedUnresolvedAlert(testDb);

    await expect(
      resolveUnresolvedEmailAlert(
        { alertId: "missing", accountId: "acc-1", alert: correctedAlert },
        deps(testDb)
      )
    ).rejects.toThrow(EmailAlertNotResolvableError);
    expect(await new UnresolvedEmailAlertRepository(testDb.db).listAll()).toHaveLength(1);
  });

  it("refuses an Account whose currency doesn't match, leaving the alert in the queue to retry", async () => {
    const testDb = createTestDb();
    await seedUnresolvedAlert(testDb);
    await new AccountRepository(testDb.db).create({
      id: "acc-usd",
      institutionId: "inst-1",
      name: "USD",
      accountNumber: "XXXX9999",
      currencyCode: "USD"
    });

    await expect(
      resolveUnresolvedEmailAlert(
        { alertId: "alert-1", accountId: "acc-usd", alert: correctedAlert },
        deps(testDb)
      )
    ).rejects.toThrow(InvalidEmailAlertError);
    expect(await new UnresolvedEmailAlertRepository(testDb.db).listAll()).toHaveLength(1);
  });

  it("finishes the resolve when the ImportBatch already exists from a prior interrupted attempt", async () => {
    const testDb = createTestDb();
    await seedUnresolvedAlert(testDb);
    const batchId = emailAlertImportBatchId(null, "inbox@example.com", "uid-9");
    const transactionId = emailAlertTransactionId(null, "inbox@example.com", "uid-9");
    let n = 0;
    await createEmailAlertImportBatch(correctedAlert, "acc-1", {
      ...deps(testDb),
      newId: () => {
        n += 1;
        if (n === 1) return batchId;
        if (n === 2) return transactionId;
        throw new Error(`unexpected id #${n}`);
      }
    });

    const batch = await resolveUnresolvedEmailAlert(
      { alertId: "alert-1", accountId: "acc-1", alert: correctedAlert },
      deps(testDb)
    );

    expect(batch.id).toBe(batchId);
    expect(await new UnresolvedEmailAlertRepository(testDb.db).listAll()).toEqual([]);
    expect(await new TransactionRepository(testDb.db).listByAccountId("acc-1")).toHaveLength(1);
  });
});
