import { randomUUID } from "node:crypto";

import postgres from "postgres";
import { describe, expect, it, vi } from "vitest";

import { updateTransfer, type TransferEditFormState } from "@/app/transfers/[id]/edit/actions";
import { PgAccountRepository } from "@/db/postgres/repositories/account-repository";
import { PgInstitutionRepository } from "@/db/postgres/repositories/institution-repository";
import { PgTransferRepository } from "@/db/postgres/repositories/transfer-repository";
import { AccountRepository } from "@/db/repositories/account-repository";
import { FixedDepositRepository } from "@/db/repositories/fixed-deposit-repository";
import { InstitutionRepository } from "@/db/repositories/institution-repository";
import { TransactionRepository } from "@/db/repositories/transaction-repository";
import { TransferRepository } from "@/db/repositories/transfer-repository";
import { createTestDb } from "@/db/repositories/test-db";

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

function transferEditFormData(overrides: Partial<Record<string, string>> = {}) {
  const values = {
    transferId: "transfer-1",
    sourceAccountId: "acc-1",
    sourceFixedDepositId: "",
    sourceAmount: "200.00",
    sourceCurrencyCode: "USD",
    destinationAccountId: "acc-2",
    destinationFixedDepositId: "",
    destinationAmount: "16600.00",
    destinationCurrencyCode: "INR",
    occurredAt: "2026-09-06T10:00",
    description: "Corrected exchange",
    purpose: "",
    ...overrides
  };
  const formData = new FormData();
  for (const [key, value] of Object.entries(values)) {
    formData.set(key, value);
  }
  return formData;
}

async function seedTransferFixture() {
  const testDb = createTestDb();
  const institutions = new InstitutionRepository(testDb.db);
  const accounts = new AccountRepository(testDb.db);
  await institutions.create({ id: "inst-1", name: "Institution One" });
  await accounts.create({
    id: "acc-1",
    institutionId: "inst-1",
    name: "USD Account",
    accountNumber: null,
    currencyCode: "USD"
  });
  await accounts.create({
    id: "acc-2",
    institutionId: "inst-1",
    name: "INR Account",
    accountNumber: null,
    currencyCode: "INR"
  });
  await new TransferRepository(testDb.db).create({
    id: "transfer-1",
    sourceAccountId: "acc-1",
    sourceFixedDepositId: null,
    sourceAmountMinor: 10_000,
    sourceCurrencyCode: "USD",
    destinationAccountId: "acc-2",
    destinationFixedDepositId: null,
    destinationAmountMinor: 830_000,
    destinationCurrencyCode: "INR",
    occurredAt: "2026-09-05T09:30:00.000Z",
    description: "Exchange",
    purpose: "general"
  });
  return testDb;
}

describe("updateTransfer", () => {
  it("rejects both-set and neither-set leg combinations, without changing the Transfer", async () => {
    const testDb = await seedTransferFixture();
    const transfers = new TransferRepository(testDb.db);
    const redirectTo = vi.fn();

    const result = await updateTransfer(
      {} as TransferEditFormState,
      transferEditFormData({ sourceFixedDepositId: "fd-1" }),
      { db: testDb.db, redirectTo }
    );

    expect(result.formError).toBeTruthy();
    expect((await transfers.getById("transfer-1"))?.description).toBe("Exchange");
    expect(redirectTo).not.toHaveBeenCalled();
  });

  it("rejects an empty description without changing the Transfer", async () => {
    const testDb = await seedTransferFixture();
    const transfers = new TransferRepository(testDb.db);
    const redirectTo = vi.fn();

    const result = await updateTransfer(
      {} as TransferEditFormState,
      transferEditFormData({ description: "   " }),
      { db: testDb.db, redirectTo }
    );

    expect(result.fieldErrors?.description).toEqual({ key: "errors.descriptionRequired" });
    expect((await transfers.getById("transfer-1"))?.description).toBe("Exchange");
    expect(redirectTo).not.toHaveBeenCalled();
  });

  it("updates a general Transfer's amounts, description, and date, and its linked Transactions", async () => {
    const testDb = await seedTransferFixture();
    const transfers = new TransferRepository(testDb.db);
    const transactions = new TransactionRepository(testDb.db);
    const redirectTo = vi.fn();

    const result = await updateTransfer({} as TransferEditFormState, transferEditFormData(), {
      db: testDb.db,
      redirectTo
    });

    expect(result).toEqual({});
    const updated = await transfers.getById("transfer-1");
    expect(updated).toEqual({
      id: "transfer-1",
      sourceAccountId: "acc-1",
      sourceFixedDepositId: null,
      sourceAmountMinor: 20000,
      sourceCurrencyCode: "USD",
      destinationAccountId: "acc-2",
      destinationFixedDepositId: null,
      destinationAmountMinor: 1_660_000,
      destinationCurrencyCode: "INR",
      occurredAt: new Date("2026-09-06T10:00").toISOString(),
      description: "Corrected exchange",
      purpose: "general"
    });
    expect(await transactions.listByAccountId("acc-1")).toEqual([
      expect.objectContaining({ id: "transfer-1-source", amountMinor: -20000 })
    ]);
    expect(redirectTo).toHaveBeenCalledWith("/transfers/transfer-1?message=transfer_updated");
  });

  it("returns a form error and does not change the Transfer when it is an opening Transfer", async () => {
    const testDb = createTestDb();
    const institutions = new InstitutionRepository(testDb.db);
    const accounts = new AccountRepository(testDb.db);
    await institutions.create({ id: "inst-1", name: "Institution One" });
    await accounts.create({
      id: "acc-1",
      institutionId: "inst-1",
      name: "USD Account",
      accountNumber: null,
      currencyCode: "USD"
    });
    await new FixedDepositRepository(testDb.db).create({
      id: "fd-1",
      name: "Term deposit",
      accountNumber: null,
      institutionId: "inst-1",
      linkedAccountId: "acc-1",
      principalMinor: 10_000,
      originalPrincipalMinor: 10_000,
      currencyCode: "USD",
      interestRateBps: 500,
      openedDate: "2026-01-01",
      maturityDate: "2027-01-01",
      status: "Open"
    });
    const transfers = new TransferRepository(testDb.db);
    await transfers.create({
      id: "opening-1",
      sourceAccountId: "acc-1",
      sourceFixedDepositId: null,
      sourceAmountMinor: 10_000,
      sourceCurrencyCode: "USD",
      destinationAccountId: null,
      destinationFixedDepositId: "fd-1",
      destinationAmountMinor: 10_000,
      destinationCurrencyCode: "USD",
      occurredAt: "2026-01-01T00:00:00.000Z",
      description: "Open FD",
      purpose: "fixed-deposit-opening"
    });
    const redirectTo = vi.fn();

    const result = await updateTransfer(
      {} as TransferEditFormState,
      transferEditFormData({
        transferId: "opening-1",
        sourceFixedDepositId: "",
        sourceAccountId: "acc-1",
        destinationAccountId: "",
        destinationFixedDepositId: "fd-1",
        sourceCurrencyCode: "USD",
        destinationCurrencyCode: "USD",
        purpose: "fixed-deposit-opening"
      }),
      { db: testDb.db, redirectTo }
    );

    expect(result.formError).toBeTruthy();
    expect((await transfers.getById("opening-1"))?.description).toBe("Open FD");
    expect(redirectTo).not.toHaveBeenCalled();
  });

  it("persists to the Postgres repository, scoped to the owner, when an owner is resolved", async () => {
    const ownerId = randomUUID();
    const institution = { id: randomUUID(), name: "Cloud Bank" };
    const accountA = {
      id: randomUUID(),
      institutionId: institution.id,
      name: "USD Account",
      accountNumber: null,
      currencyCode: "USD"
    };
    const accountB = {
      id: randomUUID(),
      institutionId: institution.id,
      name: "INR Account",
      accountNumber: null,
      currencyCode: "INR"
    };
    await new PgInstitutionRepository(TEST_DATABASE_URL, ownerId).create(institution);
    await new PgAccountRepository(TEST_DATABASE_URL, ownerId).create(accountA);
    await new PgAccountRepository(TEST_DATABASE_URL, ownerId).create(accountB);
    const pgTransfers = new PgTransferRepository(TEST_DATABASE_URL, ownerId);
    const transferId = randomUUID();
    await pgTransfers.create({
      id: transferId,
      sourceAccountId: accountA.id,
      sourceFixedDepositId: null,
      sourceAmountMinor: 10_000,
      sourceCurrencyCode: "USD",
      destinationAccountId: accountB.id,
      destinationFixedDepositId: null,
      destinationAmountMinor: 830_000,
      destinationCurrencyCode: "INR",
      occurredAt: "2026-09-05T09:30:00.000Z",
      description: "Exchange",
      purpose: "general"
    });
    const redirectTo = vi.fn();

    try {
      const result = await updateTransfer(
        {} as TransferEditFormState,
        transferEditFormData({
          transferId,
          sourceAccountId: accountA.id,
          destinationAccountId: accountB.id
        }),
        {
          getCurrentOwnerId: async () => ownerId,
          isCloudMode: () => true,
          postgresConnectionString: TEST_DATABASE_URL,
          redirectTo
        }
      );

      expect(result).toEqual({});
      expect((await pgTransfers.getById(transferId))?.sourceAmountMinor).toBe(20000);
      expect(redirectTo).toHaveBeenCalledWith(`/transfers/${transferId}?message=transfer_updated`);
    } finally {
      const admin = postgres(TEST_DATABASE_URL, { max: 1 });
      await admin`delete from transactions where transfer_id = ${transferId}`;
      await admin`delete from transfers where id = ${transferId}`;
      await admin`delete from accounts where id in (${accountA.id}, ${accountB.id})`;
      await admin`delete from institutions where id = ${institution.id}`;
      await admin.end();
    }
  });
});
