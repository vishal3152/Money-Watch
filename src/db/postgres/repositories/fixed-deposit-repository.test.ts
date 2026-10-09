import { randomUUID } from "node:crypto";

import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";

import { PgAccountRepository } from "@/db/postgres/repositories/account-repository";
import { PgFixedDepositRepository } from "@/db/postgres/repositories/fixed-deposit-repository";
import { PgInstitutionRepository } from "@/db/postgres/repositories/institution-repository";
import { PgTransactionRepository } from "@/db/postgres/repositories/transaction-repository";
import { PgTransferRepository } from "@/db/postgres/repositories/transfer-repository";
import { FixedDepositCurrencyMismatchError, FixedDepositInstitutionMismatchError } from "@/db/errors";
import { InvalidMinorUnitsError } from "@/domain/money";

const CONNECTION_STRING =
  process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

const admin = postgres(CONNECTION_STRING, { max: 1 });

afterAll(async () => {
  await admin.end();
});

async function seedOwnerWithAccount(ownerId: string) {
  const institution = { id: randomUUID(), name: "Bank" };
  const account = {
    id: randomUUID(),
    institutionId: institution.id,
    name: "Checking",
    accountNumber: null,
    currencyCode: "USD"
  };

  await new PgInstitutionRepository(CONNECTION_STRING, ownerId).create(institution);
  await new PgAccountRepository(CONNECTION_STRING, ownerId).create(account);

  return { institution, account };
}

describe("PgFixedDepositRepository", () => {
  it("listAll() only returns FixedDeposits belonging to the scoped Owner", async () => {
    const ownerA = randomUUID();
    const ownerB = randomUUID();
    const { institution: institutionA, account: accountA } = await seedOwnerWithAccount(ownerA);
    const { institution: institutionB, account: accountB } = await seedOwnerWithAccount(ownerB);

    const fixedDepositA = {
      id: randomUUID(),
      name: "Owner A FD",
      accountNumber: null,
      institutionId: institutionA.id,
      linkedAccountId: accountA.id,
      principalMinor: 100_00,
      originalPrincipalMinor: 100_00,
      currencyCode: "USD",
      interestRateBps: 500,
      openedDate: "2026-01-01",
      maturityDate: "2027-01-01",
      status: "Open" as const
    };
    const fixedDepositB = {
      ...fixedDepositA,
      id: randomUUID(),
      name: "Owner B FD",
      institutionId: institutionB.id,
      linkedAccountId: accountB.id
    };

    try {
      const repoA = new PgFixedDepositRepository(CONNECTION_STRING, ownerA);
      const repoB = new PgFixedDepositRepository(CONNECTION_STRING, ownerB);
      await repoA.create(fixedDepositA);
      await repoB.create(fixedDepositB);

      expect(await repoA.listAll()).toEqual([fixedDepositA]);
    } finally {
      await admin`delete from fixed_deposits where id in (${fixedDepositA.id}, ${fixedDepositB.id})`;
      await admin`delete from accounts where id in (${accountA.id}, ${accountB.id})`;
      await admin`delete from institutions where id in (${institutionA.id}, ${institutionB.id})`;
    }
  });

  it("listByInstitutionId() does not leak another Owner's FixedDeposits for an Institution id it does not own", async () => {
    const ownerA = randomUUID();
    const ownerB = randomUUID();
    const { institution: institutionB, account: accountB } = await seedOwnerWithAccount(ownerB);
    const fixedDepositB = {
      id: randomUUID(),
      name: "Owner B FD",
      accountNumber: null,
      institutionId: institutionB.id,
      linkedAccountId: accountB.id,
      principalMinor: 100_00,
      originalPrincipalMinor: 100_00,
      currencyCode: "USD",
      interestRateBps: 500,
      openedDate: "2026-01-01",
      maturityDate: "2027-01-01",
      status: "Open" as const
    };

    try {
      await new PgFixedDepositRepository(CONNECTION_STRING, ownerB).create(fixedDepositB);

      const repoA = new PgFixedDepositRepository(CONNECTION_STRING, ownerA);

      expect(await repoA.listByInstitutionId(institutionB.id)).toEqual([]);
    } finally {
      await admin`delete from fixed_deposits where id = ${fixedDepositB.id}`;
      await admin`delete from accounts where id = ${accountB.id}`;
      await admin`delete from institutions where id = ${institutionB.id}`;
    }
  });

  it("rejects non-positive or non-integer principal amounts", async () => {
    const ownerId = randomUUID();
    const { institution, account } = await seedOwnerWithAccount(ownerId);

    try {
      const repo = new PgFixedDepositRepository(CONNECTION_STRING, ownerId);
      const base = {
        id: randomUUID(),
        name: "Invalid FD",
        accountNumber: null,
        institutionId: institution.id,
        linkedAccountId: account.id,
        currencyCode: "USD",
        interestRateBps: 500,
        openedDate: "2026-01-01",
        maturityDate: "2027-01-01",
        status: "Open" as const
      };

      await expect(
        repo.create({ ...base, principalMinor: 0, originalPrincipalMinor: 100_00 })
      ).rejects.toThrow(InvalidMinorUnitsError);
      await expect(
        repo.create({ ...base, principalMinor: 100_00, originalPrincipalMinor: -1 })
      ).rejects.toThrow(InvalidMinorUnitsError);
      await expect(
        repo.create({ ...base, principalMinor: 10.5, originalPrincipalMinor: 100_00 })
      ).rejects.toThrow(InvalidMinorUnitsError);
    } finally {
      await admin`delete from accounts where id = ${account.id}`;
      await admin`delete from institutions where id = ${institution.id}`;
    }
  });

  it("rejects a currency mismatch against the linked Account", async () => {
    const ownerId = randomUUID();
    const { institution, account } = await seedOwnerWithAccount(ownerId);

    try {
      const repo = new PgFixedDepositRepository(CONNECTION_STRING, ownerId);

      await expect(
        repo.create({
          id: randomUUID(),
          name: "Mismatched FD",
          accountNumber: null,
          institutionId: institution.id,
          linkedAccountId: account.id,
          principalMinor: 100_00,
          originalPrincipalMinor: 100_00,
          currencyCode: "EUR",
          interestRateBps: 500,
          openedDate: "2026-01-01",
          maturityDate: "2027-01-01",
          status: "Open"
        })
      ).rejects.toThrow(FixedDepositCurrencyMismatchError);
    } finally {
      await admin`delete from accounts where id = ${account.id}`;
      await admin`delete from institutions where id = ${institution.id}`;
    }
  });

  it("rejects an Institution mismatch against the linked Account's Institution", async () => {
    const ownerId = randomUUID();
    const { institution, account } = await seedOwnerWithAccount(ownerId);
    const otherInstitution = { id: randomUUID(), name: "Other Bank" };

    try {
      await new PgInstitutionRepository(CONNECTION_STRING, ownerId).create(otherInstitution);
      const repo = new PgFixedDepositRepository(CONNECTION_STRING, ownerId);

      await expect(
        repo.create({
          id: randomUUID(),
          name: "Mismatched FD",
          accountNumber: null,
          institutionId: otherInstitution.id,
          linkedAccountId: account.id,
          principalMinor: 100_00,
          originalPrincipalMinor: 100_00,
          currencyCode: "USD",
          interestRateBps: 500,
          openedDate: "2026-01-01",
          maturityDate: "2027-01-01",
          status: "Open"
        })
      ).rejects.toThrow(FixedDepositInstitutionMismatchError);
    } finally {
      await admin`delete from accounts where id = ${account.id}`;
      await admin`delete from institutions where id in (${institution.id}, ${otherInstitution.id})`;
    }
  });

  it("atomically records an opening debit Transfer and Transaction when requested", async () => {
    const ownerId = randomUUID();
    const { institution, account } = await seedOwnerWithAccount(ownerId);
    const fixedDepositId = randomUUID();
    const transferId = randomUUID();
    const transactionId = randomUUID();

    try {
      const repo = new PgFixedDepositRepository(CONNECTION_STRING, ownerId);

      await repo.create(
        {
          id: fixedDepositId,
          name: "Term deposit",
          accountNumber: null,
          institutionId: institution.id,
          linkedAccountId: account.id,
          principalMinor: 100_000_00,
          originalPrincipalMinor: 100_000_00,
          currencyCode: "USD",
          interestRateBps: 650,
          openedDate: "2026-01-01",
          maturityDate: "2027-01-01",
          status: "Open"
        },
        { transferId, transactionId, description: "Opening deposit" }
      );

      const openingTransfer = await new PgTransferRepository(CONNECTION_STRING, ownerId).getById(
        transferId
      );
      expect(openingTransfer).toEqual({
        id: transferId,
        sourceAccountId: account.id,
        sourceFixedDepositId: null,
        sourceAmountMinor: 100_000_00,
        sourceCurrencyCode: "USD",
        destinationAccountId: null,
        destinationFixedDepositId: fixedDepositId,
        destinationAmountMinor: 100_000_00,
        destinationCurrencyCode: "USD",
        occurredAt: "2026-01-01T00:00:00.000Z",
        description: "Opening deposit",
        purpose: "fixed-deposit-opening"
      });

      const accountTransactions = await new PgTransactionRepository(
        CONNECTION_STRING,
        ownerId
      ).listByAccountId(account.id);
      expect(accountTransactions).toEqual([
        {
          id: transactionId,
          accountId: account.id,
          amountMinor: -100_000_00,
          occurredAt: "2026-01-01T00:00:00.000Z",
          description: "Opening deposit",
          trustStatus: "Confirmed",
          transferId,
          category: null,
          importBatchId: null,
          externalRef: null,
          possibleDuplicateOfTransactionId: null
        }
      ]);
    } finally {
      await admin`delete from transactions where id = ${transactionId}`;
      await admin`delete from transfers where id = ${transferId}`;
      await admin`delete from fixed_deposits where id = ${fixedDepositId}`;
      await admin`delete from accounts where id = ${account.id}`;
      await admin`delete from institutions where id = ${institution.id}`;
    }
  });
});
