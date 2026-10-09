import { describe, expect, it } from "vitest";

import { AccountRepository } from "@/db/repositories/account-repository";
import {
  DatabaseConstraintError,
  FixedDepositCurrencyMismatchError,
  FixedDepositInstitutionMismatchError
} from "@/db/errors";
import { FixedDepositRepository } from "@/db/repositories/fixed-deposit-repository";
import { InstitutionRepository } from "@/db/repositories/institution-repository";
import { TransactionRepository } from "@/db/repositories/transaction-repository";
import { TransferRepository } from "@/db/repositories/transfer-repository";
import { createTestDb } from "@/db/repositories/test-db";

describe("FixedDepositRepository", () => {
  it("creates and reads a fixed deposit", async () => {
    const testDb = createTestDb();

    const institutionRepository = new InstitutionRepository(testDb.db);
    const accountRepository = new AccountRepository(testDb.db);
    const repository = new FixedDepositRepository(testDb.db);

    await institutionRepository.create({ id: "inst-1", name: "Bank One" });
    await accountRepository.create({
      id: "acc-1",
      institutionId: "inst-1",
      name: "Primary Checking",
      accountNumber: null,
      currencyCode: "INR"
    });

    await repository.create({
      id: "fd-1",
      name: "Term deposit",
      accountNumber: null,
      institutionId: "inst-1",
      linkedAccountId: "acc-1",
      principalMinor: 100_000_00,
      originalPrincipalMinor: 100_000_00,
      currencyCode: "INR",
      interestRateBps: 650,
      openedDate: "2026-01-01",
      maturityDate: "2027-01-01",
      status: "Open"
    });

    const fixedDeposit = await repository.getById("fd-1");

    expect(fixedDeposit).toEqual({
      id: "fd-1",
      name: "Term deposit",
      accountNumber: null,
      institutionId: "inst-1",
      linkedAccountId: "acc-1",
      principalMinor: 100_000_00,
      originalPrincipalMinor: 100_000_00,
      currencyCode: "INR",
      interestRateBps: 650,
      openedDate: "2026-01-01",
      maturityDate: "2027-01-01",
      status: "Open"
    });
  });

  it("lists fixed deposits ordered by id", async () => {
    const testDb = createTestDb();

    const institutionRepository = new InstitutionRepository(testDb.db);
    const accountRepository = new AccountRepository(testDb.db);
    const repository = new FixedDepositRepository(testDb.db);

    await institutionRepository.create({ id: "inst-1", name: "Bank One" });
    await accountRepository.create({
      id: "acc-1",
      institutionId: "inst-1",
      name: "Primary Checking",
      accountNumber: null,
      currencyCode: "INR"
    });

    await repository.create({
      id: "fd-2",
      name: "Second term deposit",
      accountNumber: null,
      institutionId: "inst-1",
      linkedAccountId: "acc-1",
      principalMinor: 50_000_00,
      originalPrincipalMinor: 50_000_00,
      currencyCode: "INR",
      interestRateBps: 600,
      openedDate: "2026-02-01",
      maturityDate: "2027-02-01",
      status: "Open"
    });
    await repository.create({
      id: "fd-1",
      name: "Term deposit",
      accountNumber: null,
      institutionId: "inst-1",
      linkedAccountId: "acc-1",
      principalMinor: 100_000_00,
      originalPrincipalMinor: 100_000_00,
      currencyCode: "INR",
      interestRateBps: 650,
      openedDate: "2026-01-01",
      maturityDate: "2027-01-01",
      status: "Open"
    });

    const allFixedDeposits = await repository.listAll();

    expect(allFixedDeposits.map((fixedDeposit) => fixedDeposit.id)).toEqual(["fd-1", "fd-2"]);
  });

  it("listByInstitutionId() returns only FixedDeposits for that Institution", async () => {
    const testDb = createTestDb();

    const institutionRepository = new InstitutionRepository(testDb.db);
    const accountRepository = new AccountRepository(testDb.db);
    const repository = new FixedDepositRepository(testDb.db);

    await institutionRepository.create({ id: "inst-1", name: "Bank One" });
    await institutionRepository.create({ id: "inst-2", name: "Bank Two" });
    await accountRepository.create({
      id: "acc-1",
      institutionId: "inst-1",
      name: "Primary Checking",
      accountNumber: null,
      currencyCode: "INR"
    });
    await accountRepository.create({
      id: "acc-2",
      institutionId: "inst-2",
      name: "Other Checking",
      accountNumber: null,
      currencyCode: "INR"
    });

    await repository.create({
      id: "fd-1",
      name: "Term deposit",
      accountNumber: null,
      institutionId: "inst-1",
      linkedAccountId: "acc-1",
      principalMinor: 100_000_00,
      originalPrincipalMinor: 100_000_00,
      currencyCode: "INR",
      interestRateBps: 650,
      openedDate: "2026-01-01",
      maturityDate: "2027-01-01",
      status: "Open"
    });
    await repository.create({
      id: "fd-2",
      name: "Other bank's deposit",
      accountNumber: null,
      institutionId: "inst-2",
      linkedAccountId: "acc-2",
      principalMinor: 50_000_00,
      originalPrincipalMinor: 50_000_00,
      currencyCode: "INR",
      interestRateBps: 600,
      openedDate: "2026-02-01",
      maturityDate: "2027-02-01",
      status: "Open"
    });

    const fixedDeposits = await repository.listByInstitutionId("inst-1");

    expect(fixedDeposits.map((fixedDeposit) => fixedDeposit.id)).toEqual(["fd-1"]);
  });

  it("rejects a fixed deposit referencing an unknown institution", async () => {
    const testDb = createTestDb();

    const accountRepository = new AccountRepository(testDb.db);
    const institutionRepository = new InstitutionRepository(testDb.db);
    const repository = new FixedDepositRepository(testDb.db);

    await institutionRepository.create({ id: "inst-1", name: "Bank One" });
    await accountRepository.create({
      id: "acc-1",
      institutionId: "inst-1",
      name: "Primary Checking",
      accountNumber: null,
      currencyCode: "INR"
    });

    await expect(
      repository.create({
        id: "fd-1",
        name: "Term deposit",
        accountNumber: null,
        institutionId: "missing-institution",
        linkedAccountId: "acc-1",
        principalMinor: 100_000_00,
        originalPrincipalMinor: 100_000_00,
        currencyCode: "INR",
        interestRateBps: 650,
        openedDate: "2026-01-01",
        maturityDate: "2027-01-01",
        status: "Open"
      })
    ).rejects.toBeInstanceOf(FixedDepositInstitutionMismatchError);
  });

  it("rejects a fixed deposit referencing an unknown linked account", async () => {
    const testDb = createTestDb();

    const institutionRepository = new InstitutionRepository(testDb.db);
    const repository = new FixedDepositRepository(testDb.db);

    await institutionRepository.create({ id: "inst-1", name: "Bank One" });

    await expect(
      repository.create({
        id: "fd-1",
        name: "Term deposit",
        accountNumber: null,
        institutionId: "inst-1",
        linkedAccountId: "missing-account",
        principalMinor: 100_000_00,
        originalPrincipalMinor: 100_000_00,
        currencyCode: "INR",
        interestRateBps: 650,
        openedDate: "2026-01-01",
        maturityDate: "2027-01-01",
        status: "Open"
      })
    ).rejects.toBeInstanceOf(DatabaseConstraintError);
  });

  it("rejects a fixed deposit whose currency does not match its linked account's currency", async () => {
    const testDb = createTestDb();

    const institutionRepository = new InstitutionRepository(testDb.db);
    const accountRepository = new AccountRepository(testDb.db);
    const repository = new FixedDepositRepository(testDb.db);

    await institutionRepository.create({ id: "inst-1", name: "Bank One" });
    await accountRepository.create({
      id: "acc-1",
      institutionId: "inst-1",
      name: "Primary Checking",
      accountNumber: null,
      currencyCode: "INR"
    });

    await expect(
      repository.create({
        id: "fd-1",
        name: "Term deposit",
        accountNumber: null,
        institutionId: "inst-1",
        linkedAccountId: "acc-1",
        principalMinor: 100_000_00,
        originalPrincipalMinor: 100_000_00,
        currencyCode: "USD",
        interestRateBps: 650,
        openedDate: "2026-01-01",
        maturityDate: "2027-01-01",
        status: "Open"
      })
    ).rejects.toBeInstanceOf(FixedDepositCurrencyMismatchError);
    expect(await repository.listAll()).toEqual([]);
  });

  it("atomically records an opening debit Transfer and Transaction when requested", async () => {
    const testDb = createTestDb();

    const institutionRepository = new InstitutionRepository(testDb.db);
    const accountRepository = new AccountRepository(testDb.db);
    const repository = new FixedDepositRepository(testDb.db);

    await institutionRepository.create({ id: "inst-1", name: "Bank One" });
    await accountRepository.create({
      id: "acc-1",
      institutionId: "inst-1",
      name: "Primary Checking",
      accountNumber: null,
      currencyCode: "INR"
    });

    await repository.create(
      {
        id: "fd-1",
        name: "Term deposit",
        accountNumber: null,
        institutionId: "inst-1",
        linkedAccountId: "acc-1",
        principalMinor: 100_000_00,
        originalPrincipalMinor: 100_000_00,
        currencyCode: "INR",
        interestRateBps: 650,
        openedDate: "2026-01-01",
        maturityDate: "2027-01-01",
        status: "Open"
      },
      { transferId: "transfer-1", transactionId: "txn-1", description: "Opening deposit" }
    );

    const openingTransfer = await new TransferRepository(testDb.db).getById("transfer-1");
    expect(openingTransfer).toEqual({
      id: "transfer-1",
      sourceAccountId: "acc-1",
      sourceFixedDepositId: null,
      sourceAmountMinor: 100_000_00,
      sourceCurrencyCode: "INR",
      destinationAccountId: null,
      destinationFixedDepositId: "fd-1",
      destinationAmountMinor: 100_000_00,
      destinationCurrencyCode: "INR",
      occurredAt: "2026-01-01T00:00:00.000Z",
      description: "Opening deposit",
      purpose: "fixed-deposit-opening"
    });

    const accountTransactions = await new TransactionRepository(testDb.db).listByAccountId("acc-1");
    expect(accountTransactions).toEqual([
      {
        id: "txn-1",
        accountId: "acc-1",
        amountMinor: -100_000_00,
        occurredAt: "2026-01-01T00:00:00.000Z",
        description: "Opening deposit",
        trustStatus: "Confirmed",
        transferId: "transfer-1",
        category: null,
        importBatchId: null,
        externalRef: null,
        possibleDuplicateOfTransactionId: null
      }
    ]);
  });

  it("does not record any Transfer when no opening debit is requested", async () => {
    const testDb = createTestDb();

    const institutionRepository = new InstitutionRepository(testDb.db);
    const accountRepository = new AccountRepository(testDb.db);
    const repository = new FixedDepositRepository(testDb.db);

    await institutionRepository.create({ id: "inst-1", name: "Bank One" });
    await accountRepository.create({
      id: "acc-1",
      institutionId: "inst-1",
      name: "Primary Checking",
      accountNumber: null,
      currencyCode: "INR"
    });

    await repository.create({
      id: "fd-1",
      name: "Term deposit",
      accountNumber: null,
      institutionId: "inst-1",
      linkedAccountId: "acc-1",
      principalMinor: 100_000_00,
      originalPrincipalMinor: 100_000_00,
      currencyCode: "INR",
      interestRateBps: 650,
      openedDate: "2026-01-01",
      maturityDate: "2027-01-01",
      status: "Open"
    });

    expect(await new TransferRepository(testDb.db).listByLeg("fd-1")).toEqual([]);
    expect(await new TransactionRepository(testDb.db).listByAccountId("acc-1")).toEqual([]);
  });
});
