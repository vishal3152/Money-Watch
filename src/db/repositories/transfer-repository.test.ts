import { describe, expect, it } from "vitest";

import { computeAccountBalance } from "@/domain/account-balance";
import { AccountRepository } from "@/db/repositories/account-repository";
import {
  DatabaseConstraintError,
  TransferNotEditableError,
  TransferNotFoundError
} from "@/db/errors";
import { FixedDepositRepository } from "@/db/repositories/fixed-deposit-repository";
import { InstitutionRepository } from "@/db/repositories/institution-repository";
import { createTestDb } from "@/db/repositories/test-db";
import { TransactionRepository } from "@/db/repositories/transaction-repository";
import { TransferRepository } from "@/db/repositories/transfer-repository";
import type { FixedDepositStatus } from "@/domain/fixed-deposit";

async function seedMaturityTransferFixture(fixedDepositStatus: FixedDepositStatus = "Open") {
  const testDb = createTestDb();
  const institutions = new InstitutionRepository(testDb.db);
  const accounts = new AccountRepository(testDb.db);
  const fixedDeposits = new FixedDepositRepository(testDb.db);
  await institutions.create({ id: "inst-1", name: "Bank One" });
  await accounts.create({
    id: "acc-linked",
    institutionId: "inst-1",
    name: "Linked Account",
    accountNumber: null,
    currencyCode: "INR"
  });
  await accounts.create({
    id: "acc-other",
    institutionId: "inst-1",
    name: "Other Account",
    accountNumber: null,
    currencyCode: "INR"
  });
  await fixedDeposits.create({
    id: "fd-1",
    name: "Term deposit",
    accountNumber: null,
    institutionId: "inst-1",
    linkedAccountId: "acc-linked",
    principalMinor: 100_000_00,
    originalPrincipalMinor: 100_000_00,
    currencyCode: "INR",
    interestRateBps: 650,
    openedDate: "2026-01-01",
    maturityDate: "2027-01-01",
    status: fixedDepositStatus
  });
  return testDb;
}

describe("TransferRepository", () => {
  it("creates an account-to-account transfer as two linked transactions", async () => {
    const testDb = createTestDb();

    const institutionRepository = new InstitutionRepository(testDb.db);
    const accountRepository = new AccountRepository(testDb.db);
    const transactionRepository = new TransactionRepository(testDb.db);
    const repository = new TransferRepository(testDb.db);

    await institutionRepository.create({ id: "inst-1", name: "Bank One" });
    await accountRepository.create({
      id: "acc-usd",
      institutionId: "inst-1",
      name: "USD Checking",
      accountNumber: null,
      currencyCode: "USD"
    });
    await accountRepository.create({
      id: "acc-inr",
      institutionId: "inst-1",
      name: "INR Savings",
      accountNumber: null,
      currencyCode: "INR"
    });

    await repository.create({
      id: "transfer-1",
      sourceAccountId: "acc-usd",
      sourceFixedDepositId: null,
      sourceAmountMinor: 100_000,
      sourceCurrencyCode: "USD",
      destinationAccountId: "acc-inr",
      destinationFixedDepositId: null,
      destinationAmountMinor: 8_300_000,
      destinationCurrencyCode: "INR",
      occurredAt: "2026-01-01T00:00:00.000Z",
      description: "USD to INR transfer",
      purpose: "general"
    });

    const sourceTransactions = await transactionRepository.listByAccountId("acc-usd");
    const destinationTransactions = await transactionRepository.listByAccountId("acc-inr");

    expect(sourceTransactions).toEqual([
      {
        id: "transfer-1-source",
        accountId: "acc-usd",
        amountMinor: -100_000,
        occurredAt: "2026-01-01T00:00:00.000Z",
        description: "USD to INR transfer",
        trustStatus: "Confirmed",
        transferId: "transfer-1",
        category: null,
        importBatchId: null,
        externalRef: null,
        possibleDuplicateOfTransactionId: null
      }
    ]);
    expect(destinationTransactions).toEqual([
      {
        id: "transfer-1-destination",
        accountId: "acc-inr",
        amountMinor: 8_300_000,
        occurredAt: "2026-01-01T00:00:00.000Z",
        description: "USD to INR transfer",
        trustStatus: "Confirmed",
        transferId: "transfer-1",
        category: null,
        importBatchId: null,
        externalRef: null,
        possibleDuplicateOfTransactionId: null
      }
    ]);
    expect(computeAccountBalance(sourceTransactions)).toBe(-100_000);
    expect(computeAccountBalance(destinationTransactions)).toBe(8_300_000);
  });

  it("creates an account-to-fixed-deposit transfer as one transaction on the account side only", async () => {
    const testDb = createTestDb();

    const institutionRepository = new InstitutionRepository(testDb.db);
    const accountRepository = new AccountRepository(testDb.db);
    const fixedDepositRepository = new FixedDepositRepository(testDb.db);
    const transactionRepository = new TransactionRepository(testDb.db);
    const repository = new TransferRepository(testDb.db);

    await institutionRepository.create({ id: "inst-1", name: "Bank One" });
    await accountRepository.create({
      id: "acc-inr",
      institutionId: "inst-1",
      name: "INR Savings",
      accountNumber: null,
      currencyCode: "INR"
    });
    await fixedDepositRepository.create({
      id: "fd-1",
      name: "Term deposit",
      accountNumber: null,
      institutionId: "inst-1",
      linkedAccountId: "acc-inr",
      principalMinor: 100_000_00,
      originalPrincipalMinor: 100_000_00,
      currencyCode: "INR",
      interestRateBps: 650,
      openedDate: "2026-01-01",
      maturityDate: "2027-01-01",
      status: "Open"
    });

    await repository.create({
      id: "transfer-2",
      sourceAccountId: "acc-inr",
      sourceFixedDepositId: null,
      sourceAmountMinor: 100_000_00,
      sourceCurrencyCode: "INR",
      destinationAccountId: null,
      destinationFixedDepositId: "fd-1",
      destinationAmountMinor: 100_000_00,
      destinationCurrencyCode: "INR",
      occurredAt: "2026-01-01T00:00:00.000Z",
      description: "Open fixed deposit",
      purpose: "fixed-deposit-opening"
    });

    const accountTransactions = await transactionRepository.listByAccountId("acc-inr");

    expect(accountTransactions).toEqual([
      {
        id: "transfer-2-source",
        accountId: "acc-inr",
        amountMinor: -100_000_00,
        occurredAt: "2026-01-01T00:00:00.000Z",
        description: "Open fixed deposit",
        trustStatus: "Confirmed",
        transferId: "transfer-2",
        category: null,
        importBatchId: null,
        externalRef: null,
        possibleDuplicateOfTransactionId: null
      }
    ]);
  });

  it("rejects a second opening transfer for a fixed deposit that already has one", async () => {
    const testDb = createTestDb();

    const institutionRepository = new InstitutionRepository(testDb.db);
    const accountRepository = new AccountRepository(testDb.db);
    const fixedDepositRepository = new FixedDepositRepository(testDb.db);
    const repository = new TransferRepository(testDb.db);

    await institutionRepository.create({ id: "inst-1", name: "Bank One" });
    await accountRepository.create({
      id: "acc-inr",
      institutionId: "inst-1",
      name: "INR Savings",
      accountNumber: null,
      currencyCode: "INR"
    });
    await fixedDepositRepository.create({
      id: "fd-1",
      name: "Term deposit",
      accountNumber: null,
      institutionId: "inst-1",
      linkedAccountId: "acc-inr",
      principalMinor: 100_000_00,
      originalPrincipalMinor: 100_000_00,
      currencyCode: "INR",
      interestRateBps: 650,
      openedDate: "2026-01-01",
      maturityDate: "2027-01-01",
      status: "Open"
    });

    await repository.create({
      id: "transfer-1",
      sourceAccountId: "acc-inr",
      sourceFixedDepositId: null,
      sourceAmountMinor: 100_000_00,
      sourceCurrencyCode: "INR",
      destinationAccountId: null,
      destinationFixedDepositId: "fd-1",
      destinationAmountMinor: 100_000_00,
      destinationCurrencyCode: "INR",
      occurredAt: "2026-01-01T00:00:00.000Z",
      description: "Open fixed deposit",
      purpose: "fixed-deposit-opening"
    });

    await expect(
      repository.create({
        id: "transfer-2",
        sourceAccountId: "acc-inr",
        sourceFixedDepositId: null,
        sourceAmountMinor: 100_000_00,
        sourceCurrencyCode: "INR",
        destinationAccountId: null,
        destinationFixedDepositId: "fd-1",
        destinationAmountMinor: 100_000_00,
        destinationCurrencyCode: "INR",
        occurredAt: "2026-01-02T00:00:00.000Z",
        description: "Duplicate opening",
        purpose: "fixed-deposit-opening"
      })
    ).rejects.toThrow("A Fixed Deposit can only have one opening Transfer.");

    expect(await repository.getById("transfer-2")).toBeNull();
  });

  it("rejects a same-currency opening Transfer whose amount differs from original principal", async () => {
    const testDb = await seedMaturityTransferFixture();
    const repository = new TransferRepository(testDb.db);

    await expect(
      repository.create({
        id: "transfer-mismatch",
        sourceAccountId: "acc-linked",
        sourceFixedDepositId: null,
        sourceAmountMinor: 250_000_00,
        sourceCurrencyCode: "INR",
        destinationAccountId: null,
        destinationFixedDepositId: "fd-1",
        destinationAmountMinor: 250_000_00,
        destinationCurrencyCode: "INR",
        occurredAt: "2026-01-01T00:00:00.000Z",
        description: "Mismatched opening",
        purpose: "fixed-deposit-opening"
      })
    ).rejects.toThrow("Opening Transfer amount must match the Fixed Deposit original principal.");

    expect(await repository.getById("transfer-mismatch")).toBeNull();
  });

  it("rejects same-currency Transfers whose leg amounts differ", async () => {
    const testDb = await seedMaturityTransferFixture();
    const repository = new TransferRepository(testDb.db);

    await expect(
      repository.create({
        id: "transfer-unequal",
        sourceAccountId: "acc-linked",
        sourceFixedDepositId: null,
        sourceAmountMinor: 10_000_00,
        sourceCurrencyCode: "INR",
        destinationAccountId: null,
        destinationFixedDepositId: "fd-1",
        destinationAmountMinor: 1_000_000_00,
        destinationCurrencyCode: "INR",
        occurredAt: "2026-02-01T00:00:00.000Z",
        description: "Money creation",
        purpose: "fixed-deposit-top-up"
      })
    ).rejects.toThrow("Same-currency Transfer amounts must match on both legs.");
  });

  it("rejects non-positive Fixed Deposit Transfer amounts", async () => {
    const testDb = await seedMaturityTransferFixture();
    const repository = new TransferRepository(testDb.db);

    await expect(
      repository.create({
        id: "transfer-neg",
        sourceAccountId: null,
        sourceFixedDepositId: "fd-1",
        sourceAmountMinor: -1_000_00,
        sourceCurrencyCode: "INR",
        destinationAccountId: "acc-linked",
        destinationFixedDepositId: null,
        destinationAmountMinor: -1_000_00,
        destinationCurrencyCode: "INR",
        occurredAt: "2026-02-01T00:00:00.000Z",
        description: "Negative withdrawal",
        purpose: "fixed-deposit-withdrawal"
      })
    ).rejects.toThrow("Transfer amounts must be greater than zero.");
  });

  it("rejects a transfer with an invalid leg before writing to the database", async () => {
    const testDb = createTestDb();

    const repository = new TransferRepository(testDb.db);

    await expect(
      repository.create({
        id: "transfer-1",
        sourceAccountId: null,
        sourceFixedDepositId: null,
        sourceAmountMinor: 100_000,
        sourceCurrencyCode: "USD",
        destinationAccountId: "acc-inr",
        destinationFixedDepositId: null,
        destinationAmountMinor: 8_300_000,
        destinationCurrencyCode: "INR",
        occurredAt: "2026-01-01T00:00:00.000Z",
        description: "Invalid transfer",
        purpose: "general"
      })
    ).rejects.toThrow("Transfer source must reference exactly one of an Account or Fixed Deposit.");
  });

  it("makes a created transfer retrievable by id", async () => {
    const testDb = createTestDb();

    const institutionRepository = new InstitutionRepository(testDb.db);
    const accountRepository = new AccountRepository(testDb.db);
    const repository = new TransferRepository(testDb.db);

    await institutionRepository.create({ id: "inst-1", name: "Bank One" });
    await accountRepository.create({
      id: "acc-usd",
      institutionId: "inst-1",
      name: "USD Checking",
      accountNumber: null,
      currencyCode: "USD"
    });
    await accountRepository.create({
      id: "acc-inr",
      institutionId: "inst-1",
      name: "INR Savings",
      accountNumber: null,
      currencyCode: "INR"
    });

    await repository.create({
      id: "transfer-1",
      sourceAccountId: "acc-usd",
      sourceFixedDepositId: null,
      sourceAmountMinor: 100_000,
      sourceCurrencyCode: "USD",
      destinationAccountId: "acc-inr",
      destinationFixedDepositId: null,
      destinationAmountMinor: 8_300_000,
      destinationCurrencyCode: "INR",
      occurredAt: "2026-01-01T00:00:00.000Z",
      description: "USD to INR transfer",
      purpose: "general"
    });

    const transfer = await repository.getById("transfer-1");

    expect(transfer).toEqual({
      id: "transfer-1",
      sourceAccountId: "acc-usd",
      sourceFixedDepositId: null,
      sourceAmountMinor: 100_000,
      sourceCurrencyCode: "USD",
      destinationAccountId: "acc-inr",
      destinationFixedDepositId: null,
      destinationAmountMinor: 8_300_000,
      destinationCurrencyCode: "INR",
      occurredAt: "2026-01-01T00:00:00.000Z",
      description: "USD to INR transfer",
      purpose: "general"
    });
  });

  it("rejects a transfer referencing an unknown account", async () => {
    const testDb = createTestDb();

    const repository = new TransferRepository(testDb.db);

    await expect(
      repository.create({
        id: "transfer-1",
        sourceAccountId: "missing-account",
        sourceFixedDepositId: null,
        sourceAmountMinor: 100_000,
        sourceCurrencyCode: "USD",
        destinationAccountId: null,
        destinationFixedDepositId: "missing-fixed-deposit",
        destinationAmountMinor: 100_000,
        destinationCurrencyCode: "USD",
        occurredAt: "2026-01-01T00:00:00.000Z",
        description: "Invalid transfer",
        purpose: "fixed-deposit-opening"
      })
    ).rejects.toBeInstanceOf(DatabaseConstraintError);
  });

  it("matures an Open Fixed Deposit when transferring it to its linked Account", async () => {
    const testDb = await seedMaturityTransferFixture();
    const transfers = new TransferRepository(testDb.db);
    const fixedDeposits = new FixedDepositRepository(testDb.db);

    await transfers.create({
      id: "maturity-1",
      sourceAccountId: null,
      sourceFixedDepositId: "fd-1",
      sourceAmountMinor: 106_500_00,
      sourceCurrencyCode: "INR",
      destinationAccountId: "acc-linked",
      destinationFixedDepositId: null,
      destinationAmountMinor: 106_500_00,
      destinationCurrencyCode: "INR",
      occurredAt: "2027-01-01T00:00:00.000Z",
      description: "Fixed Deposit maturity",
      purpose: "fixed-deposit-withdrawal"
    });

    expect((await fixedDeposits.getById("fd-1"))?.status).toBe("Matured");
    expect(await transfers.getById("maturity-1")).not.toBeNull();
  });

  it("rejects a Transfer sourced from a Matured Fixed Deposit without writing", async () => {
    const testDb = await seedMaturityTransferFixture("Matured");
    const transfers = new TransferRepository(testDb.db);
    const transactions = new TransactionRepository(testDb.db);

    await expect(
      transfers.create({
        id: "maturity-1",
        sourceAccountId: null,
        sourceFixedDepositId: "fd-1",
        sourceAmountMinor: 106_500_00,
        sourceCurrencyCode: "INR",
        destinationAccountId: "acc-linked",
        destinationFixedDepositId: null,
        destinationAmountMinor: 106_500_00,
        destinationCurrencyCode: "INR",
        occurredAt: "2027-01-01T00:00:00.000Z",
        description: "Duplicate maturity",
        purpose: "fixed-deposit-withdrawal"
      })
    ).rejects.toThrow("Only an Open Fixed Deposit can be used as a Transfer source.");

    expect(await transfers.getById("maturity-1")).toBeNull();
    expect(await transactions.listByAccountId("acc-linked")).toEqual([]);
  });

  it("rejects a Fixed Deposit maturity Transfer to an Account other than its linked Account", async () => {
    const testDb = await seedMaturityTransferFixture();
    const transfers = new TransferRepository(testDb.db);
    const fixedDeposits = new FixedDepositRepository(testDb.db);
    const transactions = new TransactionRepository(testDb.db);

    await expect(
      transfers.create({
        id: "maturity-1",
        sourceAccountId: null,
        sourceFixedDepositId: "fd-1",
        sourceAmountMinor: 106_500_00,
        sourceCurrencyCode: "INR",
        destinationAccountId: "acc-other",
        destinationFixedDepositId: null,
        destinationAmountMinor: 106_500_00,
        destinationCurrencyCode: "INR",
        occurredAt: "2027-01-01T00:00:00.000Z",
        description: "Wrong payout destination",
        purpose: "fixed-deposit-withdrawal"
      })
    ).rejects.toThrow("A Fixed Deposit withdrawal must pay out to its linked Account.");

    expect(await transfers.getById("maturity-1")).toBeNull();
    expect(await transactions.listByAccountId("acc-other")).toEqual([]);
    expect((await fixedDeposits.getById("fd-1"))?.status).toBe("Open");
  });

  it("rejects a transfer whose source currency does not match the source Account's currency", async () => {
    const testDb = createTestDb();
    const institutionRepository = new InstitutionRepository(testDb.db);
    const accountRepository = new AccountRepository(testDb.db);
    const repository = new TransferRepository(testDb.db);

    await institutionRepository.create({ id: "inst-1", name: "Bank One" });
    await accountRepository.create({
      id: "acc-inr",
      institutionId: "inst-1",
      name: "INR Savings",
      accountNumber: null,
      currencyCode: "INR"
    });
    await accountRepository.create({
      id: "acc-inr-2",
      institutionId: "inst-1",
      name: "INR Other",
      accountNumber: null,
      currencyCode: "INR"
    });

    await expect(
      repository.create({
        id: "transfer-1",
        sourceAccountId: "acc-inr",
        sourceFixedDepositId: null,
        sourceAmountMinor: 100_00,
        sourceCurrencyCode: "USD",
        destinationAccountId: "acc-inr-2",
        destinationFixedDepositId: null,
        destinationAmountMinor: 100_00,
        destinationCurrencyCode: "INR",
        occurredAt: "2026-01-01T00:00:00.000Z",
        description: "Mismatched currency",
        purpose: "general"
      })
    ).rejects.toThrow("Transfer source currency must match the Account's currency (INR).");

    expect(await repository.getById("transfer-1")).toBeNull();
    expect(await new TransactionRepository(testDb.db).listByAccountId("acc-inr")).toEqual([]);
  });

  it("rejects a transfer whose destination currency does not match the destination Account's currency", async () => {
    const testDb = createTestDb();
    const institutionRepository = new InstitutionRepository(testDb.db);
    const accountRepository = new AccountRepository(testDb.db);
    const repository = new TransferRepository(testDb.db);

    await institutionRepository.create({ id: "inst-1", name: "Bank One" });
    await accountRepository.create({
      id: "acc-usd",
      institutionId: "inst-1",
      name: "USD Checking",
      accountNumber: null,
      currencyCode: "USD"
    });
    await accountRepository.create({
      id: "acc-inr",
      institutionId: "inst-1",
      name: "INR Savings",
      accountNumber: null,
      currencyCode: "INR"
    });

    await expect(
      repository.create({
        id: "transfer-1",
        sourceAccountId: "acc-usd",
        sourceFixedDepositId: null,
        sourceAmountMinor: 100_00,
        sourceCurrencyCode: "USD",
        destinationAccountId: "acc-inr",
        destinationFixedDepositId: null,
        destinationAmountMinor: 100_00,
        destinationCurrencyCode: "USD",
        occurredAt: "2026-01-01T00:00:00.000Z",
        description: "Mismatched currency",
        purpose: "general"
      })
    ).rejects.toThrow("Transfer destination currency must match the Account's currency (INR).");

    expect(await repository.getById("transfer-1")).toBeNull();
    expect(await new TransactionRepository(testDb.db).listByAccountId("acc-inr")).toEqual([]);
  });

  it("rejects a transfer whose source currency does not match a source Fixed Deposit's currency", async () => {
    const testDb = await seedMaturityTransferFixture();
    const repository = new TransferRepository(testDb.db);

    await expect(
      repository.create({
        id: "maturity-1",
        sourceAccountId: null,
        sourceFixedDepositId: "fd-1",
        sourceAmountMinor: 106_500_00,
        sourceCurrencyCode: "USD",
        destinationAccountId: "acc-linked",
        destinationFixedDepositId: null,
        destinationAmountMinor: 106_500_00,
        destinationCurrencyCode: "INR",
        occurredAt: "2027-01-01T00:00:00.000Z",
        description: "Mismatched maturity currency",
        purpose: "fixed-deposit-withdrawal"
      })
    ).rejects.toThrow("Transfer source currency must match the Fixed Deposit's currency (INR).");

    expect((await new FixedDepositRepository(testDb.db).getById("fd-1"))?.status).toBe("Open");
  });

  it("deletes an account-to-account transfer along with its linked transactions", async () => {
    const testDb = createTestDb();
    const institutionRepository = new InstitutionRepository(testDb.db);
    const accountRepository = new AccountRepository(testDb.db);
    const transactionRepository = new TransactionRepository(testDb.db);
    const repository = new TransferRepository(testDb.db);

    await institutionRepository.create({ id: "inst-1", name: "Bank One" });
    await accountRepository.create({
      id: "acc-usd",
      institutionId: "inst-1",
      name: "USD Checking",
      accountNumber: null,
      currencyCode: "USD"
    });
    await accountRepository.create({
      id: "acc-inr",
      institutionId: "inst-1",
      name: "INR Savings",
      accountNumber: null,
      currencyCode: "INR"
    });
    await repository.create({
      id: "transfer-1",
      sourceAccountId: "acc-usd",
      sourceFixedDepositId: null,
      sourceAmountMinor: 100_000,
      sourceCurrencyCode: "USD",
      destinationAccountId: "acc-inr",
      destinationFixedDepositId: null,
      destinationAmountMinor: 8_300_000,
      destinationCurrencyCode: "INR",
      occurredAt: "2026-01-01T00:00:00.000Z",
      description: "USD to INR transfer",
      purpose: "general"
    });

    await repository.delete("transfer-1");

    expect(await repository.getById("transfer-1")).toBeNull();
    expect(await transactionRepository.listByAccountId("acc-usd")).toEqual([]);
    expect(await transactionRepository.listByAccountId("acc-inr")).toEqual([]);
  });

  it("deletes a Fixed Deposit maturity transfer and reverts the Fixed Deposit back to Open", async () => {
    const testDb = await seedMaturityTransferFixture();
    const transfers = new TransferRepository(testDb.db);
    const fixedDeposits = new FixedDepositRepository(testDb.db);
    const transactions = new TransactionRepository(testDb.db);

    await transfers.create({
      id: "maturity-1",
      sourceAccountId: null,
      sourceFixedDepositId: "fd-1",
      sourceAmountMinor: 106_500_00,
      sourceCurrencyCode: "INR",
      destinationAccountId: "acc-linked",
      destinationFixedDepositId: null,
      destinationAmountMinor: 106_500_00,
      destinationCurrencyCode: "INR",
      occurredAt: "2027-01-01T00:00:00.000Z",
      description: "Fixed Deposit maturity",
      purpose: "fixed-deposit-withdrawal"
    });
    expect((await fixedDeposits.getById("fd-1"))?.status).toBe("Matured");

    await transfers.delete("maturity-1");

    expect(await transfers.getById("maturity-1")).toBeNull();
    expect((await fixedDeposits.getById("fd-1"))?.status).toBe("Open");
    expect(await transactions.listByAccountId("acc-linked")).toEqual([]);
  });

  it("applies a Fixed Deposit top-up by increasing current principal", async () => {
    const testDb = await seedMaturityTransferFixture();
    const transfers = new TransferRepository(testDb.db);
    const fixedDeposits = new FixedDepositRepository(testDb.db);

    await transfers.create({
      id: "top-up-1",
      sourceAccountId: "acc-other",
      sourceFixedDepositId: null,
      sourceAmountMinor: 10_000_00,
      sourceCurrencyCode: "INR",
      destinationAccountId: null,
      destinationFixedDepositId: "fd-1",
      destinationAmountMinor: 10_000_00,
      destinationCurrencyCode: "INR",
      occurredAt: "2026-02-01T00:00:00.000Z",
      description: "Top up fixed deposit",
      purpose: "fixed-deposit-top-up"
    });

    expect((await fixedDeposits.getById("fd-1"))?.principalMinor).toBe(110_000_00);
    expect((await fixedDeposits.getById("fd-1"))?.status).toBe("Open");
  });

  it("supports partial Fixed Deposit withdrawal without closing it", async () => {
    const testDb = await seedMaturityTransferFixture();
    const transfers = new TransferRepository(testDb.db);
    const fixedDeposits = new FixedDepositRepository(testDb.db);

    await transfers.create({
      id: "withdrawal-1",
      sourceAccountId: null,
      sourceFixedDepositId: "fd-1",
      sourceAmountMinor: 25_000_00,
      sourceCurrencyCode: "INR",
      destinationAccountId: "acc-linked",
      destinationFixedDepositId: null,
      destinationAmountMinor: 25_000_00,
      destinationCurrencyCode: "INR",
      occurredAt: "2026-03-01T00:00:00.000Z",
      description: "Partial withdrawal",
      purpose: "fixed-deposit-withdrawal"
    });

    expect((await fixedDeposits.getById("fd-1"))?.principalMinor).toBe(75_000_00);
    expect((await fixedDeposits.getById("fd-1"))?.status).toBe("Open");
  });

  it("marks zero-balance Fixed Deposit as PrematurelyClosed before maturity date", async () => {
    const testDb = await seedMaturityTransferFixture();
    const transfers = new TransferRepository(testDb.db);
    const fixedDeposits = new FixedDepositRepository(testDb.db);

    await transfers.create({
      id: "withdrawal-full-early",
      sourceAccountId: null,
      sourceFixedDepositId: "fd-1",
      sourceAmountMinor: 100_000_00,
      sourceCurrencyCode: "INR",
      destinationAccountId: "acc-linked",
      destinationFixedDepositId: null,
      destinationAmountMinor: 100_000_00,
      destinationCurrencyCode: "INR",
      occurredAt: "2026-06-01T00:00:00.000Z",
      description: "Premature full withdrawal",
      purpose: "fixed-deposit-withdrawal"
    });

    expect((await fixedDeposits.getById("fd-1"))?.principalMinor).toBe(0);
    expect((await fixedDeposits.getById("fd-1"))?.status).toBe("PrematurelyClosed");
  });

  it("marks zero-balance Fixed Deposit as Matured on or after maturity date", async () => {
    const testDb = await seedMaturityTransferFixture();
    const transfers = new TransferRepository(testDb.db);
    const fixedDeposits = new FixedDepositRepository(testDb.db);

    await transfers.create({
      id: "withdrawal-full-matured",
      sourceAccountId: null,
      sourceFixedDepositId: "fd-1",
      sourceAmountMinor: 100_000_00,
      sourceCurrencyCode: "INR",
      destinationAccountId: "acc-linked",
      destinationFixedDepositId: null,
      destinationAmountMinor: 100_000_00,
      destinationCurrencyCode: "INR",
      occurredAt: "2027-01-01T00:00:00.000Z",
      description: "Maturity withdrawal",
      purpose: "fixed-deposit-withdrawal"
    });

    expect((await fixedDeposits.getById("fd-1"))?.principalMinor).toBe(0);
    expect((await fixedDeposits.getById("fd-1"))?.status).toBe("Matured");
  });

  it("rejects a withdrawal above current principal", async () => {
    const testDb = await seedMaturityTransferFixture();
    const transfers = new TransferRepository(testDb.db);

    await expect(
      transfers.create({
        id: "withdrawal-over",
        sourceAccountId: null,
        sourceFixedDepositId: "fd-1",
        sourceAmountMinor: 100_000_01,
        sourceCurrencyCode: "INR",
        destinationAccountId: "acc-linked",
        destinationFixedDepositId: null,
        destinationAmountMinor: 100_000_01,
        destinationCurrencyCode: "INR",
        occurredAt: "2026-06-01T00:00:00.000Z",
        description: "Over withdrawal",
        purpose: "fixed-deposit-withdrawal"
      })
    ).rejects.toThrow("Withdrawal amount cannot exceed the Fixed Deposit current principal.");
  });

  it("recomputes principal and status after deleting one of multiple top-ups", async () => {
    const testDb = await seedMaturityTransferFixture();
    const transfers = new TransferRepository(testDb.db);
    const fixedDeposits = new FixedDepositRepository(testDb.db);

    await transfers.create({
      id: "top-up-1",
      sourceAccountId: "acc-other",
      sourceFixedDepositId: null,
      sourceAmountMinor: 10_000_00,
      sourceCurrencyCode: "INR",
      destinationAccountId: null,
      destinationFixedDepositId: "fd-1",
      destinationAmountMinor: 10_000_00,
      destinationCurrencyCode: "INR",
      occurredAt: "2026-02-01T00:00:00.000Z",
      description: "Top up 1",
      purpose: "fixed-deposit-top-up"
    });
    await transfers.create({
      id: "top-up-2",
      sourceAccountId: "acc-other",
      sourceFixedDepositId: null,
      sourceAmountMinor: 5_000_00,
      sourceCurrencyCode: "INR",
      destinationAccountId: null,
      destinationFixedDepositId: "fd-1",
      destinationAmountMinor: 5_000_00,
      destinationCurrencyCode: "INR",
      occurredAt: "2026-03-01T00:00:00.000Z",
      description: "Top up 2",
      purpose: "fixed-deposit-top-up"
    });

    await transfers.delete("top-up-1");

    expect((await fixedDeposits.getById("fd-1"))?.principalMinor).toBe(105_000_00);
    expect((await fixedDeposits.getById("fd-1"))?.status).toBe("Open");
  });

  it("recomputes principal correctly after deleting the middle Transfer of a mixed top-up/withdrawal/top-up sequence", async () => {
    const testDb = await seedMaturityTransferFixture();
    const transfers = new TransferRepository(testDb.db);
    const fixedDeposits = new FixedDepositRepository(testDb.db);

    await transfers.create({
      id: "top-up-1",
      sourceAccountId: "acc-other",
      sourceFixedDepositId: null,
      sourceAmountMinor: 30_000_00,
      sourceCurrencyCode: "INR",
      destinationAccountId: null,
      destinationFixedDepositId: "fd-1",
      destinationAmountMinor: 30_000_00,
      destinationCurrencyCode: "INR",
      occurredAt: "2026-02-01T00:00:00.000Z",
      description: "Top up 1",
      purpose: "fixed-deposit-top-up"
    });
    await transfers.create({
      id: "withdrawal-mid",
      sourceAccountId: null,
      sourceFixedDepositId: "fd-1",
      sourceAmountMinor: 20_000_00,
      sourceCurrencyCode: "INR",
      destinationAccountId: "acc-linked",
      destinationFixedDepositId: null,
      destinationAmountMinor: 20_000_00,
      destinationCurrencyCode: "INR",
      occurredAt: "2026-03-01T00:00:00.000Z",
      description: "Mid withdrawal",
      purpose: "fixed-deposit-withdrawal"
    });
    await transfers.create({
      id: "top-up-2",
      sourceAccountId: "acc-other",
      sourceFixedDepositId: null,
      sourceAmountMinor: 10_000_00,
      sourceCurrencyCode: "INR",
      destinationAccountId: null,
      destinationFixedDepositId: "fd-1",
      destinationAmountMinor: 10_000_00,
      destinationCurrencyCode: "INR",
      occurredAt: "2026-04-01T00:00:00.000Z",
      description: "Top up 2",
      purpose: "fixed-deposit-top-up"
    });
    // Incremental creation: 100,000 + 30,000 = 130,000; - 20,000 = 110,000; + 10,000 = 120,000.
    expect((await fixedDeposits.getById("fd-1"))?.principalMinor).toBe(120_000_00);

    await transfers.delete("withdrawal-mid");

    // Full replay of the two surviving top-ups from the original principal, in date order:
    // 100,000 + 30,000 + 10,000 = 140,000 — not a naive re-application on top of the
    // pre-delete 120,000 value (which would double-count and land on 150,000).
    const fd = await fixedDeposits.getById("fd-1");
    expect(fd?.principalMinor).toBe(140_000_00);
    expect(fd?.status).toBe("Open");
  });

  it("recomputes both Fixed Deposits when an edit retargets a withdrawal's source to a different Fixed Deposit", async () => {
    const testDb = await seedMaturityTransferFixture();
    const fixedDeposits = new FixedDepositRepository(testDb.db);
    const transfers = new TransferRepository(testDb.db);
    await fixedDeposits.create({
      id: "fd-2",
      name: "Second deposit",
      accountNumber: null,
      institutionId: "inst-1",
      linkedAccountId: "acc-linked",
      principalMinor: 50_000_00,
      originalPrincipalMinor: 50_000_00,
      currencyCode: "INR",
      interestRateBps: 500,
      openedDate: "2026-01-01",
      maturityDate: "2027-01-01",
      status: "Open"
    });
    await transfers.create({
      id: "withdrawal-1",
      sourceAccountId: null,
      sourceFixedDepositId: "fd-1",
      sourceAmountMinor: 20_000_00,
      sourceCurrencyCode: "INR",
      destinationAccountId: "acc-linked",
      destinationFixedDepositId: null,
      destinationAmountMinor: 20_000_00,
      destinationCurrencyCode: "INR",
      occurredAt: "2026-03-01T00:00:00.000Z",
      description: "Withdrawal from fd-1",
      purpose: "fixed-deposit-withdrawal"
    });
    expect((await fixedDeposits.getById("fd-1"))?.principalMinor).toBe(80_000_00);
    expect((await fixedDeposits.getById("fd-2"))?.principalMinor).toBe(50_000_00);

    await transfers.update("withdrawal-1", {
      sourceAccountId: null,
      sourceFixedDepositId: "fd-2",
      sourceAmountMinor: 20_000_00,
      sourceCurrencyCode: "INR",
      destinationAccountId: "acc-linked",
      destinationFixedDepositId: null,
      destinationAmountMinor: 20_000_00,
      destinationCurrencyCode: "INR",
      occurredAt: "2026-03-01T00:00:00.000Z",
      description: "Withdrawal moved to fd-2",
      purpose: "fixed-deposit-withdrawal"
    });

    // fd-1 must revert (the withdrawal no longer touches it) and fd-2 must now carry it.
    expect((await fixedDeposits.getById("fd-1"))?.principalMinor).toBe(100_000_00);
    expect((await fixedDeposits.getById("fd-1"))?.status).toBe("Open");
    expect((await fixedDeposits.getById("fd-2"))?.principalMinor).toBe(30_000_00);
    expect((await fixedDeposits.getById("fd-2"))?.status).toBe("Open");
  });

  it("does nothing when deleting a Transfer that does not exist", async () => {
    const testDb = createTestDb();
    const repository = new TransferRepository(testDb.db);

    await expect(repository.delete("missing-transfer")).resolves.toBeUndefined();
  });

  it("lists Transfers by any Account or Fixed Deposit leg in chronological order", async () => {
    const testDb = await seedMaturityTransferFixture();
    const transfers = new TransferRepository(testDb.db);
    await transfers.create({
      id: "opening",
      sourceAccountId: "acc-other",
      sourceFixedDepositId: null,
      sourceAmountMinor: 100_000_00,
      sourceCurrencyCode: "INR",
      destinationAccountId: null,
      destinationFixedDepositId: "fd-1",
      destinationAmountMinor: 100_000_00,
      destinationCurrencyCode: "INR",
      occurredAt: "2026-01-01T00:00:00.000Z",
      description: "Open Fixed Deposit",
      purpose: "fixed-deposit-opening"
    });
    await transfers.create({
      id: "maturity",
      sourceAccountId: null,
      sourceFixedDepositId: "fd-1",
      sourceAmountMinor: 106_500_00,
      sourceCurrencyCode: "INR",
      destinationAccountId: "acc-linked",
      destinationFixedDepositId: null,
      destinationAmountMinor: 106_500_00,
      destinationCurrencyCode: "INR",
      occurredAt: "2027-01-01T00:00:00.000Z",
      description: "Mature Fixed Deposit",
      purpose: "fixed-deposit-withdrawal"
    });

    expect((await transfers.listByLeg("fd-1")).map((transfer) => transfer.id)).toEqual([
      "opening",
      "maturity"
    ]);
    expect((await transfers.listByLeg("acc-linked")).map((transfer) => transfer.id)).toEqual([
      "maturity"
    ]);
  });

  describe("getTransferImpactByAccountId", () => {
    it("counts Transfers touching an Account and names the Account counterparties, excluding Fixed Deposit legs", async () => {
      const testDb = await seedMaturityTransferFixture();
      const transfers = new TransferRepository(testDb.db);
      // acc-other <-> acc-linked: contributes a count and a counterparty name.
      await transfers.create({
        id: "general-transfer",
        sourceAccountId: "acc-other",
        sourceFixedDepositId: null,
        sourceAmountMinor: 5_000_00,
        sourceCurrencyCode: "INR",
        destinationAccountId: "acc-linked",
        destinationFixedDepositId: null,
        destinationAmountMinor: 5_000_00,
        destinationCurrencyCode: "INR",
        occurredAt: "2026-01-10T00:00:00.000Z",
        description: "General transfer",
        purpose: "general"
      });
      // fd-1 <-> acc-linked: contributes to the count but has no Account counterparty name.
      await transfers.create({
        id: "maturity",
        sourceAccountId: null,
        sourceFixedDepositId: "fd-1",
        sourceAmountMinor: 106_500_00,
        sourceCurrencyCode: "INR",
        destinationAccountId: "acc-linked",
        destinationFixedDepositId: null,
        destinationAmountMinor: 106_500_00,
        destinationCurrencyCode: "INR",
        occurredAt: "2027-01-01T00:00:00.000Z",
        description: "Mature Fixed Deposit",
        purpose: "fixed-deposit-withdrawal"
      });

      const impact = await transfers.getTransferImpactByAccountId("acc-linked");

      expect(impact).toEqual({
        transferCount: 2,
        counterpartyAccountNames: ["Other Account"]
      });
    });

    it("returns a zero impact for an Account with no Transfers", async () => {
      const testDb = await seedMaturityTransferFixture();

      const impact = await new TransferRepository(testDb.db).getTransferImpactByAccountId("acc-other");

      expect(impact).toEqual({ transferCount: 0, counterpartyAccountNames: [] });
    });
  });

  describe("update", () => {
    it("replaces a general Transfer's amounts, description, and date, and its linked Transactions", async () => {
      const testDb = createTestDb();
      const institutionRepository = new InstitutionRepository(testDb.db);
      const accountRepository = new AccountRepository(testDb.db);
      const transactionRepository = new TransactionRepository(testDb.db);
      const repository = new TransferRepository(testDb.db);

      await institutionRepository.create({ id: "inst-1", name: "Bank One" });
      await accountRepository.create({
        id: "acc-usd",
        institutionId: "inst-1",
        name: "USD Checking",
        accountNumber: null,
        currencyCode: "USD"
      });
      await accountRepository.create({
        id: "acc-inr",
        institutionId: "inst-1",
        name: "INR Savings",
        accountNumber: null,
        currencyCode: "INR"
      });
      await repository.create({
        id: "transfer-1",
        sourceAccountId: "acc-usd",
        sourceFixedDepositId: null,
        sourceAmountMinor: 100_000,
        sourceCurrencyCode: "USD",
        destinationAccountId: "acc-inr",
        destinationFixedDepositId: null,
        destinationAmountMinor: 8_300_000,
        destinationCurrencyCode: "INR",
        occurredAt: "2026-01-01T00:00:00.000Z",
        description: "USD to INR transfer",
        purpose: "general"
      });

      const updated = await repository.update("transfer-1", {
        sourceAccountId: "acc-usd",
        sourceFixedDepositId: null,
        sourceAmountMinor: 200_000,
        sourceCurrencyCode: "USD",
        destinationAccountId: "acc-inr",
        destinationFixedDepositId: null,
        destinationAmountMinor: 16_600_000,
        destinationCurrencyCode: "INR",
        occurredAt: "2026-01-02T00:00:00.000Z",
        description: "Corrected transfer",
        purpose: "general"
      });

      expect(updated).toEqual({
        id: "transfer-1",
        sourceAccountId: "acc-usd",
        sourceFixedDepositId: null,
        sourceAmountMinor: 200_000,
        sourceCurrencyCode: "USD",
        destinationAccountId: "acc-inr",
        destinationFixedDepositId: null,
        destinationAmountMinor: 16_600_000,
        destinationCurrencyCode: "INR",
        occurredAt: "2026-01-02T00:00:00.000Z",
        description: "Corrected transfer",
        purpose: "general"
      });
      expect(await repository.getById("transfer-1")).toEqual(updated);

      const sourceTransactions = await transactionRepository.listByAccountId("acc-usd");
      const destinationTransactions = await transactionRepository.listByAccountId("acc-inr");
      expect(sourceTransactions).toEqual([
        {
          id: "transfer-1-source",
          accountId: "acc-usd",
          amountMinor: -200_000,
          occurredAt: "2026-01-02T00:00:00.000Z",
          description: "Corrected transfer",
          trustStatus: "Confirmed",
          transferId: "transfer-1",
          category: null,
          importBatchId: null,
          externalRef: null,
          possibleDuplicateOfTransactionId: null
        }
      ]);
      expect(destinationTransactions).toEqual([
        {
          id: "transfer-1-destination",
          accountId: "acc-inr",
          amountMinor: 16_600_000,
          occurredAt: "2026-01-02T00:00:00.000Z",
          description: "Corrected transfer",
          trustStatus: "Confirmed",
          transferId: "transfer-1",
          category: null,
          importBatchId: null,
          externalRef: null,
          possibleDuplicateOfTransactionId: null
        }
      ]);
    });

    it("rejects editing an opening Transfer, without changing it", async () => {
      const testDb = await seedMaturityTransferFixture();
      const repository = new TransferRepository(testDb.db);
      await repository.create({
        id: "opening-1",
        sourceAccountId: "acc-linked",
        sourceFixedDepositId: null,
        sourceAmountMinor: 100_000_00,
        sourceCurrencyCode: "INR",
        destinationAccountId: null,
        destinationFixedDepositId: "fd-1",
        destinationAmountMinor: 100_000_00,
        destinationCurrencyCode: "INR",
        occurredAt: "2026-01-01T00:00:00.000Z",
        description: "Open fixed deposit",
        purpose: "fixed-deposit-opening"
      });

      await expect(
        repository.update("opening-1", {
          sourceAccountId: "acc-linked",
          sourceFixedDepositId: null,
          sourceAmountMinor: 100_000_00,
          sourceCurrencyCode: "INR",
          destinationAccountId: null,
          destinationFixedDepositId: "fd-1",
          destinationAmountMinor: 100_000_00,
          destinationCurrencyCode: "INR",
          occurredAt: "2026-01-01T00:00:00.000Z",
          description: "Changed description",
          purpose: "fixed-deposit-opening"
        })
      ).rejects.toBeInstanceOf(TransferNotEditableError);

      expect((await repository.getById("opening-1"))?.description).toBe("Open fixed deposit");
    });

    it("rejects changing a general Transfer's purpose into fixed-deposit-opening", async () => {
      const testDb = await seedMaturityTransferFixture();
      const repository = new TransferRepository(testDb.db);
      await repository.create({
        id: "top-up-1",
        sourceAccountId: "acc-other",
        sourceFixedDepositId: null,
        sourceAmountMinor: 10_000_00,
        sourceCurrencyCode: "INR",
        destinationAccountId: null,
        destinationFixedDepositId: "fd-1",
        destinationAmountMinor: 10_000_00,
        destinationCurrencyCode: "INR",
        occurredAt: "2026-02-01T00:00:00.000Z",
        description: "Top up",
        purpose: "fixed-deposit-top-up"
      });

      await expect(
        repository.update("top-up-1", {
          sourceAccountId: "acc-other",
          sourceFixedDepositId: null,
          sourceAmountMinor: 10_000_00,
          sourceCurrencyCode: "INR",
          destinationAccountId: null,
          destinationFixedDepositId: "fd-1",
          destinationAmountMinor: 10_000_00,
          destinationCurrencyCode: "INR",
          occurredAt: "2026-02-01T00:00:00.000Z",
          description: "Top up",
          purpose: "fixed-deposit-opening"
        })
      ).rejects.toBeInstanceOf(TransferNotEditableError);
    });

    it("recomputes Fixed Deposit principal after editing a top-up amount", async () => {
      const testDb = await seedMaturityTransferFixture();
      const transfers = new TransferRepository(testDb.db);
      const fixedDeposits = new FixedDepositRepository(testDb.db);
      await transfers.create({
        id: "top-up-1",
        sourceAccountId: "acc-other",
        sourceFixedDepositId: null,
        sourceAmountMinor: 10_000_00,
        sourceCurrencyCode: "INR",
        destinationAccountId: null,
        destinationFixedDepositId: "fd-1",
        destinationAmountMinor: 10_000_00,
        destinationCurrencyCode: "INR",
        occurredAt: "2026-02-01T00:00:00.000Z",
        description: "Top up",
        purpose: "fixed-deposit-top-up"
      });
      expect((await fixedDeposits.getById("fd-1"))?.principalMinor).toBe(110_000_00);

      await transfers.update("top-up-1", {
        sourceAccountId: "acc-other",
        sourceFixedDepositId: null,
        sourceAmountMinor: 25_000_00,
        sourceCurrencyCode: "INR",
        destinationAccountId: null,
        destinationFixedDepositId: "fd-1",
        destinationAmountMinor: 25_000_00,
        destinationCurrencyCode: "INR",
        occurredAt: "2026-02-01T00:00:00.000Z",
        description: "Corrected top up",
        purpose: "fixed-deposit-top-up"
      });

      expect((await fixedDeposits.getById("fd-1"))?.principalMinor).toBe(125_000_00);
      expect((await fixedDeposits.getById("fd-1"))?.status).toBe("Open");
    });

    it("recomputes both Fixed Deposits when an edit moves a top-up to a different Fixed Deposit", async () => {
      const testDb = await seedMaturityTransferFixture();
      const institutionRepository = new InstitutionRepository(testDb.db);
      const fixedDeposits = new FixedDepositRepository(testDb.db);
      const transfers = new TransferRepository(testDb.db);
      await fixedDeposits.create({
        id: "fd-2",
        name: "Second deposit",
        accountNumber: null,
        institutionId: "inst-1",
        linkedAccountId: "acc-linked",
        principalMinor: 50_000_00,
        originalPrincipalMinor: 50_000_00,
        currencyCode: "INR",
        interestRateBps: 500,
        openedDate: "2026-01-01",
        maturityDate: "2027-01-01",
        status: "Open"
      });
      await transfers.create({
        id: "top-up-1",
        sourceAccountId: "acc-other",
        sourceFixedDepositId: null,
        sourceAmountMinor: 10_000_00,
        sourceCurrencyCode: "INR",
        destinationAccountId: null,
        destinationFixedDepositId: "fd-1",
        destinationAmountMinor: 10_000_00,
        destinationCurrencyCode: "INR",
        occurredAt: "2026-02-01T00:00:00.000Z",
        description: "Top up",
        purpose: "fixed-deposit-top-up"
      });

      await transfers.update("top-up-1", {
        sourceAccountId: "acc-other",
        sourceFixedDepositId: null,
        sourceAmountMinor: 10_000_00,
        sourceCurrencyCode: "INR",
        destinationAccountId: null,
        destinationFixedDepositId: "fd-2",
        destinationAmountMinor: 10_000_00,
        destinationCurrencyCode: "INR",
        occurredAt: "2026-02-01T00:00:00.000Z",
        description: "Moved top up",
        purpose: "fixed-deposit-top-up"
      });

      expect((await fixedDeposits.getById("fd-1"))?.principalMinor).toBe(100_000_00);
      expect((await fixedDeposits.getById("fd-2"))?.principalMinor).toBe(60_000_00);
    });

    it("allows increasing a partial withdrawal's amount as long as it stays within the original principal", async () => {
      const testDb = await seedMaturityTransferFixture();
      const transfers = new TransferRepository(testDb.db);
      const fixedDeposits = new FixedDepositRepository(testDb.db);
      await transfers.create({
        id: "withdrawal-1",
        sourceAccountId: null,
        sourceFixedDepositId: "fd-1",
        sourceAmountMinor: 60_000_00,
        sourceCurrencyCode: "INR",
        destinationAccountId: "acc-linked",
        destinationFixedDepositId: null,
        destinationAmountMinor: 60_000_00,
        destinationCurrencyCode: "INR",
        occurredAt: "2026-03-01T00:00:00.000Z",
        description: "Partial withdrawal",
        purpose: "fixed-deposit-withdrawal"
      });
      expect((await fixedDeposits.getById("fd-1"))?.principalMinor).toBe(40_000_00);

      // 90,000.00 is still within the FixedDeposit's original 100,000.00 principal, so this
      // edit must succeed — it must not be validated against the FD's already-decremented
      // current principal (40,000.00), which would make it look like an overdraw.
      await transfers.update("withdrawal-1", {
        sourceAccountId: null,
        sourceFixedDepositId: "fd-1",
        sourceAmountMinor: 90_000_00,
        sourceCurrencyCode: "INR",
        destinationAccountId: "acc-linked",
        destinationFixedDepositId: null,
        destinationAmountMinor: 90_000_00,
        destinationCurrencyCode: "INR",
        occurredAt: "2026-03-01T00:00:00.000Z",
        description: "Increased withdrawal",
        purpose: "fixed-deposit-withdrawal"
      });

      const fd = await fixedDeposits.getById("fd-1");
      expect(fd?.principalMinor).toBe(10_000_00);
      expect(fd?.status).toBe("Open");
    });

    it("allows editing a withdrawal Transfer that fully closed its own Fixed Deposit (e.g. fixing its description)", async () => {
      const testDb = await seedMaturityTransferFixture();
      const transfers = new TransferRepository(testDb.db);
      const fixedDeposits = new FixedDepositRepository(testDb.db);
      await transfers.create({
        id: "withdrawal-1",
        sourceAccountId: null,
        sourceFixedDepositId: "fd-1",
        sourceAmountMinor: 100_000_00,
        sourceCurrencyCode: "INR",
        destinationAccountId: "acc-linked",
        destinationFixedDepositId: null,
        destinationAmountMinor: 100_000_00,
        destinationCurrencyCode: "INR",
        occurredAt: "2026-06-01T00:00:00.000Z",
        description: "Full withdrawal",
        purpose: "fixed-deposit-withdrawal"
      });
      expect((await fixedDeposits.getById("fd-1"))?.status).toBe("PrematurelyClosed");

      // The Transfer detail page always offers "Edit Transfer" here (only opening Transfers
      // are excluded), so a same-amount edit — like fixing a typo in the description — must
      // not be rejected just because this very Transfer is what closed the FixedDeposit.
      await transfers.update("withdrawal-1", {
        sourceAccountId: null,
        sourceFixedDepositId: "fd-1",
        sourceAmountMinor: 100_000_00,
        sourceCurrencyCode: "INR",
        destinationAccountId: "acc-linked",
        destinationFixedDepositId: null,
        destinationAmountMinor: 100_000_00,
        destinationCurrencyCode: "INR",
        occurredAt: "2026-06-01T00:00:00.000Z",
        description: "Full withdrawal (typo fixed)",
        purpose: "fixed-deposit-withdrawal"
      });

      const fd = await fixedDeposits.getById("fd-1");
      expect(fd?.principalMinor).toBe(0);
      expect(fd?.status).toBe("PrematurelyClosed");
      expect((await transfers.getById("withdrawal-1"))?.description).toBe("Full withdrawal (typo fixed)");
    });

    it("still rejects increasing a withdrawal beyond the Fixed Deposit's original principal", async () => {
      const testDb = await seedMaturityTransferFixture();
      const transfers = new TransferRepository(testDb.db);
      const fixedDeposits = new FixedDepositRepository(testDb.db);
      await transfers.create({
        id: "withdrawal-1",
        sourceAccountId: null,
        sourceFixedDepositId: "fd-1",
        sourceAmountMinor: 60_000_00,
        sourceCurrencyCode: "INR",
        destinationAccountId: "acc-linked",
        destinationFixedDepositId: null,
        destinationAmountMinor: 60_000_00,
        destinationCurrencyCode: "INR",
        occurredAt: "2026-03-01T00:00:00.000Z",
        description: "Partial withdrawal",
        purpose: "fixed-deposit-withdrawal"
      });

      await expect(
        transfers.update("withdrawal-1", {
          sourceAccountId: null,
          sourceFixedDepositId: "fd-1",
          sourceAmountMinor: 150_000_00,
          sourceCurrencyCode: "INR",
          destinationAccountId: "acc-linked",
          destinationFixedDepositId: null,
          destinationAmountMinor: 150_000_00,
          destinationCurrencyCode: "INR",
          occurredAt: "2026-03-01T00:00:00.000Z",
          description: "Overdrawn edit",
          purpose: "fixed-deposit-withdrawal"
        })
      ).rejects.toThrow("Withdrawal amount cannot exceed the Fixed Deposit current principal.");
      expect((await transfers.getById("withdrawal-1"))?.sourceAmountMinor).toBe(60_000_00);
    });

    it("throws on an unknown transfer id", async () => {
      const testDb = createTestDb();
      const repository = new TransferRepository(testDb.db);

      await expect(
        repository.update("missing-transfer", {
          sourceAccountId: "acc-usd",
          sourceFixedDepositId: null,
          sourceAmountMinor: 1000,
          sourceCurrencyCode: "USD",
          destinationAccountId: "acc-inr",
          destinationFixedDepositId: null,
          destinationAmountMinor: 1000,
          destinationCurrencyCode: "USD",
          occurredAt: "2026-01-01T00:00:00.000Z",
          description: "Unknown",
          purpose: "general"
        })
      ).rejects.toBeInstanceOf(TransferNotFoundError);
    });

    it("rejects an invalid leg combination before writing, leaving the original unchanged", async () => {
      const testDb = createTestDb();
      const institutionRepository = new InstitutionRepository(testDb.db);
      const accountRepository = new AccountRepository(testDb.db);
      const repository = new TransferRepository(testDb.db);
      await institutionRepository.create({ id: "inst-1", name: "Bank One" });
      await accountRepository.create({
        id: "acc-usd",
        institutionId: "inst-1",
        name: "USD Checking",
        accountNumber: null,
        currencyCode: "USD"
      });
      await accountRepository.create({
        id: "acc-inr",
        institutionId: "inst-1",
        name: "INR Savings",
        accountNumber: null,
        currencyCode: "INR"
      });
      await repository.create({
        id: "transfer-1",
        sourceAccountId: "acc-usd",
        sourceFixedDepositId: null,
        sourceAmountMinor: 100_000,
        sourceCurrencyCode: "USD",
        destinationAccountId: "acc-inr",
        destinationFixedDepositId: null,
        destinationAmountMinor: 8_300_000,
        destinationCurrencyCode: "INR",
        occurredAt: "2026-01-01T00:00:00.000Z",
        description: "USD to INR transfer",
        purpose: "general"
      });

      await expect(
        repository.update("transfer-1", {
          sourceAccountId: null,
          sourceFixedDepositId: null,
          sourceAmountMinor: 100_000,
          sourceCurrencyCode: "USD",
          destinationAccountId: "acc-inr",
          destinationFixedDepositId: null,
          destinationAmountMinor: 8_300_000,
          destinationCurrencyCode: "INR",
          occurredAt: "2026-01-01T00:00:00.000Z",
          description: "Invalid edit",
          purpose: "general"
        })
      ).rejects.toThrow("Transfer source must reference exactly one of an Account or Fixed Deposit.");

      const unchanged = await repository.getById("transfer-1");
      expect(unchanged?.description).toBe("USD to INR transfer");
      expect(unchanged?.sourceAccountId).toBe("acc-usd");
    });
  });
});
