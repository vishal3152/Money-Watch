import { describe, expect, it } from "vitest";

import { AccountRepository } from "@/db/repositories/account-repository";
import {
  AccountHardDeleteBlockedError,
  AccountNotFoundError,
  DatabaseConstraintError,
  EntityHasDependentsError
} from "@/db/errors";
import { BalanceSnapshotRepository } from "@/db/repositories/balance-snapshot-repository";
import { FixedDepositRepository } from "@/db/repositories/fixed-deposit-repository";
import { InstitutionRepository } from "@/db/repositories/institution-repository";
import { ReconciliationRepository } from "@/db/repositories/reconciliation-repository";
import { createTestDb } from "@/db/repositories/test-db";
import { TransactionRepository } from "@/db/repositories/transaction-repository";
import { TransferRepository } from "@/db/repositories/transfer-repository";

describe("AccountRepository", () => {
  it("creates, reads, and lists accounts", async () => {
    const testDb = createTestDb();

    const repository = new AccountRepository(testDb.db);
    const institutionRepository = new InstitutionRepository(testDb.db);

    await institutionRepository.create({ id: "inst-1", name: "Bank One" });
    await institutionRepository.create({ id: "inst-2", name: "Bank Two" });

    await repository.create({
      id: "acc-1",
      institutionId: "inst-1",
      name: "Primary Checking",
      accountNumber: null,
      currencyCode: "INR"
    });
    await repository.create({
      id: "acc-2",
      institutionId: "inst-2",
      name: "USD Brokerage",
      accountNumber: null,
      currencyCode: "USD"
    });

    const account = await repository.getById("acc-1");
    const allAccounts = await repository.listAll();

    expect(account).toEqual({
      id: "acc-1",
      institutionId: "inst-1",
      name: "Primary Checking",
      accountNumber: null,
      currencyCode: "INR"
    });
    expect(allAccounts).toEqual([
      {
        id: "acc-1",
        institutionId: "inst-1",
        name: "Primary Checking",
        accountNumber: null,
        currencyCode: "INR"
      },
      {
        id: "acc-2",
        institutionId: "inst-2",
        name: "USD Brokerage",
        accountNumber: null,
        currencyCode: "USD"
      }
    ]);
  });

  it("listByInstitutionId() returns only Accounts for that Institution", async () => {
    const testDb = createTestDb();

    const repository = new AccountRepository(testDb.db);
    const institutionRepository = new InstitutionRepository(testDb.db);

    await institutionRepository.create({ id: "inst-1", name: "Bank One" });
    await institutionRepository.create({ id: "inst-2", name: "Bank Two" });

    await repository.create({
      id: "acc-1",
      institutionId: "inst-1",
      name: "Primary Checking",
      accountNumber: null,
      currencyCode: "INR"
    });
    await repository.create({
      id: "acc-2",
      institutionId: "inst-2",
      name: "USD Brokerage",
      accountNumber: null,
      currencyCode: "USD"
    });

    expect(await repository.listByInstitutionId("inst-1")).toEqual([
      {
        id: "acc-1",
        institutionId: "inst-1",
        name: "Primary Checking",
        accountNumber: null,
        currencyCode: "INR"
      }
    ]);
  });

  it("rejects an account referencing an unknown institution", async () => {
    const testDb = createTestDb();

    const repository = new AccountRepository(testDb.db);

    await expect(
      repository.create({
        id: "acc-1",
        institutionId: "missing-institution",
        name: "Primary Checking",
        accountNumber: null,
        currencyCode: "INR"
      })
    ).rejects.toBeInstanceOf(DatabaseConstraintError);
  });

  it("updates an Account's name and account number", async () => {
    const testDb = createTestDb();
    await new InstitutionRepository(testDb.db).create({ id: "inst-1", name: "Bank One" });
    const repository = new AccountRepository(testDb.db);
    await repository.create({
      id: "acc-1",
      institutionId: "inst-1",
      name: "Savings",
      accountNumber: null,
      currencyCode: "INR"
    });

    const updated = await repository.update("acc-1", {
      name: "Primary Savings",
      accountNumber: "1234567890"
    });

    const expected = {
      id: "acc-1",
      institutionId: "inst-1",
      name: "Primary Savings",
      accountNumber: "1234567890",
      currencyCode: "INR"
    };
    expect(updated).toEqual(expected);
    expect(await repository.getById("acc-1")).toEqual(expected);
  });

  it("rejects updating an unknown Account", async () => {
    const testDb = createTestDb();
    const repository = new AccountRepository(testDb.db);

    await expect(repository.update("missing", { name: "New Name" })).rejects.toBeInstanceOf(
      AccountNotFoundError
    );
  });

  it("deletes an Account with no Transactions, Reconciliations, or linked FixedDeposits", async () => {
    const testDb = createTestDb();
    await new InstitutionRepository(testDb.db).create({ id: "inst-1", name: "Bank One" });
    const repository = new AccountRepository(testDb.db);
    await repository.create({
      id: "acc-1",
      institutionId: "inst-1",
      name: "Savings",
      accountNumber: null,
      currencyCode: "INR"
    });

    await repository.delete("acc-1");

    expect(await repository.getById("acc-1")).toBeNull();
  });

  it("rejects deleting an Account that still has Transactions", async () => {
    const testDb = createTestDb();
    await new InstitutionRepository(testDb.db).create({ id: "inst-1", name: "Bank One" });
    const repository = new AccountRepository(testDb.db);
    await repository.create({
      id: "acc-1",
      institutionId: "inst-1",
      name: "Savings",
      accountNumber: null,
      currencyCode: "INR"
    });
    await new TransactionRepository(testDb.db).create({
      id: "txn-1",
      accountId: "acc-1",
      amountMinor: 1000,
      occurredAt: "2026-01-01T00:00:00.000Z",
      description: "Deposit",
      trustStatus: "Confirmed",
      transferId: null,
      category: null,
      importBatchId: null
    });

    await expect(repository.delete("acc-1")).rejects.toBeInstanceOf(EntityHasDependentsError);
    expect(await repository.getById("acc-1")).not.toBeNull();
  });

  it("rejects deleting an Account that still has Reconciliations", async () => {
    const testDb = createTestDb();
    await new InstitutionRepository(testDb.db).create({ id: "inst-1", name: "Bank One" });
    const repository = new AccountRepository(testDb.db);
    await repository.create({
      id: "acc-1",
      institutionId: "inst-1",
      name: "Savings",
      accountNumber: null,
      currencyCode: "INR"
    });
    await new BalanceSnapshotRepository(testDb.db).create({
      id: "snap-1",
      accountId: "acc-1",
      asOfDate: "2026-01-31",
      balanceMinor: 0
    });
    await new ReconciliationRepository(testDb.db).create({
      id: "recon-1",
      accountId: "acc-1",
      balanceSnapshotId: "snap-1",
      reconciledAt: "2026-02-01T00:00:00.000Z"
    });

    await expect(repository.delete("acc-1")).rejects.toBeInstanceOf(EntityHasDependentsError);
  });

  it("rejects deleting an Account that a FixedDeposit is linked to", async () => {
    const testDb = createTestDb();
    await new InstitutionRepository(testDb.db).create({ id: "inst-1", name: "Bank One" });
    const repository = new AccountRepository(testDb.db);
    await repository.create({
      id: "acc-1",
      institutionId: "inst-1",
      name: "Savings",
      accountNumber: null,
      currencyCode: "INR"
    });
    await new FixedDepositRepository(testDb.db).create({
      id: "fd-1",
      name: "Term deposit",
      accountNumber: null,
      institutionId: "inst-1",
      linkedAccountId: "acc-1",
      principalMinor: 100_000,
      originalPrincipalMinor: 100_000,
      currencyCode: "INR",
      interestRateBps: 650,
      openedDate: "2026-01-01",
      maturityDate: "2027-01-01",
      status: "Open"
    });

    await expect(repository.delete("acc-1")).rejects.toBeInstanceOf(EntityHasDependentsError);
  });

  it("hardDelete() removes an Account along with its Transactions, Reconciliation, Discrepancy, and Adjustment", async () => {
    const testDb = createTestDb();
    await new InstitutionRepository(testDb.db).create({ id: "inst-1", name: "Bank One" });
    const repository = new AccountRepository(testDb.db);
    await repository.create({
      id: "acc-1",
      institutionId: "inst-1",
      name: "Savings",
      accountNumber: null,
      currencyCode: "INR"
    });
    const transactionRepository = new TransactionRepository(testDb.db);
    await transactionRepository.create({
      id: "txn-1",
      accountId: "acc-1",
      amountMinor: 1_000,
      occurredAt: "2026-01-01T00:00:00.000Z",
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
      balanceMinor: 500
    });
    const reconciliationRepository = new ReconciliationRepository(testDb.db);
    await reconciliationRepository.create({
      id: "recon-1",
      accountId: "acc-1",
      balanceSnapshotId: "snap-1",
      reconciledAt: "2026-02-01T00:00:00.000Z"
    });
    await reconciliationRepository.resolveWithAdjustment("recon-1-discrepancy", {
      id: "adj-txn-1",
      accountId: "acc-1",
      amountMinor: -500,
      occurredAt: "2026-02-01T00:00:00.000Z",
      description: "Adjustment"
    });

    await repository.hardDelete("acc-1");

    expect(await repository.getById("acc-1")).toBeNull();
    expect(await transactionRepository.getById("txn-1")).toBeNull();
    expect(await transactionRepository.getById("adj-txn-1")).toBeNull();
    expect(await reconciliationRepository.getById("recon-1")).toBeNull();
    expect(await reconciliationRepository.getDiscrepancyByReconciliationId("recon-1")).toBeNull();
  });

  it("rejects hardDelete() of an Account a FixedDeposit is linked to", async () => {
    const testDb = createTestDb();
    await new InstitutionRepository(testDb.db).create({ id: "inst-1", name: "Bank One" });
    const repository = new AccountRepository(testDb.db);
    await repository.create({
      id: "acc-1",
      institutionId: "inst-1",
      name: "Savings",
      accountNumber: null,
      currencyCode: "INR"
    });
    await new FixedDepositRepository(testDb.db).create({
      id: "fd-1",
      name: "Term deposit",
      accountNumber: null,
      institutionId: "inst-1",
      linkedAccountId: "acc-1",
      principalMinor: 100_000,
      originalPrincipalMinor: 100_000,
      currencyCode: "INR",
      interestRateBps: 650,
      openedDate: "2026-01-01",
      maturityDate: "2027-01-01",
      status: "Open"
    });

    await expect(repository.hardDelete("acc-1")).rejects.toBeInstanceOf(EntityHasDependentsError);
    expect(await repository.getById("acc-1")).not.toBeNull();
  });

  it("hardDelete() removes a Transfer and both linked Transactions when the other Account has not reconciled it", async () => {
    const testDb = createTestDb();
    await new InstitutionRepository(testDb.db).create({ id: "inst-1", name: "Bank One" });
    const repository = new AccountRepository(testDb.db);
    await repository.create({
      id: "acc-1",
      institutionId: "inst-1",
      name: "Savings",
      accountNumber: null,
      currencyCode: "INR"
    });
    await repository.create({
      id: "acc-2",
      institutionId: "inst-1",
      name: "Checking",
      accountNumber: null,
      currencyCode: "INR"
    });
    const transferRepository = new TransferRepository(testDb.db);
    await transferRepository.create({
      id: "xfer-1",
      sourceAccountId: "acc-1",
      sourceFixedDepositId: null,
      sourceAmountMinor: 1_000,
      sourceCurrencyCode: "INR",
      destinationAccountId: "acc-2",
      destinationFixedDepositId: null,
      destinationAmountMinor: 1_000,
      destinationCurrencyCode: "INR",
      occurredAt: "2026-01-01T00:00:00.000Z",
      description: "Move to checking",
      purpose: "general"
    });

    await repository.hardDelete("acc-1");

    const transactionRepository = new TransactionRepository(testDb.db);
    expect(await repository.getById("acc-1")).toBeNull();
    expect(await transferRepository.getById("xfer-1")).toBeNull();
    expect(await transactionRepository.getById("xfer-1-source")).toBeNull();
    expect(await transactionRepository.getById("xfer-1-destination")).toBeNull();
    expect(await repository.getById("acc-2")).not.toBeNull();
  });

  it("rejects hardDelete() when the other side of a Transfer has already reconciled it", async () => {
    const testDb = createTestDb();
    await new InstitutionRepository(testDb.db).create({ id: "inst-1", name: "Bank One" });
    const repository = new AccountRepository(testDb.db);
    await repository.create({
      id: "acc-1",
      institutionId: "inst-1",
      name: "Savings",
      accountNumber: null,
      currencyCode: "INR"
    });
    await repository.create({
      id: "acc-2",
      institutionId: "inst-1",
      name: "Checking",
      accountNumber: null,
      currencyCode: "INR"
    });
    const transferRepository = new TransferRepository(testDb.db);
    await transferRepository.create({
      id: "xfer-1",
      sourceAccountId: "acc-1",
      sourceFixedDepositId: null,
      sourceAmountMinor: 1_000,
      sourceCurrencyCode: "INR",
      destinationAccountId: "acc-2",
      destinationFixedDepositId: null,
      destinationAmountMinor: 1_000,
      destinationCurrencyCode: "INR",
      occurredAt: "2026-01-01T00:00:00.000Z",
      description: "Move to checking",
      purpose: "general"
    });
    await new BalanceSnapshotRepository(testDb.db).create({
      id: "snap-2",
      accountId: "acc-2",
      asOfDate: "2026-01-31",
      balanceMinor: 1_000
    });
    await new ReconciliationRepository(testDb.db).create({
      id: "recon-2",
      accountId: "acc-2",
      balanceSnapshotId: "snap-2",
      reconciledAt: "2026-02-01T00:00:00.000Z"
    });

    await expect(repository.hardDelete("acc-1")).rejects.toBeInstanceOf(AccountHardDeleteBlockedError);
    expect(await repository.getById("acc-1")).not.toBeNull();
    expect(await transferRepository.getById("xfer-1")).not.toBeNull();
  });

  it("hardDelete() on a nonexistent Account is a no-op", async () => {
    const testDb = createTestDb();
    const repository = new AccountRepository(testDb.db);

    await expect(repository.hardDelete("missing")).resolves.toBeUndefined();
  });
});
