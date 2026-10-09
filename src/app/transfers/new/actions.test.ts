import { randomUUID } from "node:crypto";

import postgres from "postgres";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createTransfer, type TransferFormState } from "@/app/transfers/new/actions";
import { resetIdempotencyKeysForTests } from "@/app/duplicate-submission-guard";
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

function transferFormData(overrides: Partial<Record<string, string>> = {}) {
  const values = {
    sourceAccountId: "acc-1",
    sourceFixedDepositId: "",
    sourceAmount: "100.00",
    sourceCurrencyCode: "USD",
    destinationAccountId: "acc-2",
    destinationFixedDepositId: "",
    destinationAmount: "8300.00",
    destinationCurrencyCode: "INR",
    occurredAt: "2026-09-05T09:30",
    description: "Exchange",
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
  await accounts.create({
    id: "acc-3",
    institutionId: "inst-1",
    name: "Other Account",
    accountNumber: null,
    currencyCode: "INR"
  });
  await new FixedDepositRepository(testDb.db).create({
    id: "fd-1",
    name: "Term deposit",
    accountNumber: null,
    institutionId: "inst-1",
    linkedAccountId: "acc-2",
    principalMinor: 830000,
    originalPrincipalMinor: 830000,
    currencyCode: "INR",
    interestRateBps: 650,
    openedDate: "2026-01-01",
    maturityDate: "2027-01-01",
    status: "Open"
  });
  return testDb;
}

describe("createTransfer", () => {
  beforeEach(() => {
    resetIdempotencyKeysForTests();
  });

  it("rejects a second submission carrying the same idempotencyKey as a likely duplicate", async () => {
    const testDb = await seedTransferFixture();
    const transfers = new TransferRepository(testDb.db);

    const first = transferFormData({});
    first.set("idempotencyKey", "same-key");
    const firstResult = await createTransfer({} as TransferFormState, first, {
      db: testDb.db,
      redirectTo: vi.fn(),
      newId: () => "transfer-first"
    });
    expect(firstResult).toEqual({});

    const second = transferFormData({});
    second.set("idempotencyKey", "same-key");
    const redirectTo = vi.fn();
    const secondResult = await createTransfer({} as TransferFormState, second, {
      db: testDb.db,
      redirectTo,
      newId: () => "transfer-second"
    });

    expect(secondResult.formError).toEqual({ key: "errors.transferDuplicateSubmission" });
    expect(redirectTo).not.toHaveBeenCalled();
    expect(await transfers.getById("transfer-second")).toBeNull();
  });

  it("allows two submissions with different idempotencyKeys (or none) to both persist", async () => {
    const testDb = await seedTransferFixture();
    const transfers = new TransferRepository(testDb.db);

    await createTransfer({} as TransferFormState, transferFormData({}), {
      db: testDb.db,
      redirectTo: vi.fn(),
      newId: () => "transfer-1"
    });
    await createTransfer({} as TransferFormState, transferFormData({}), {
      db: testDb.db,
      redirectTo: vi.fn(),
      newId: () => "transfer-2"
    });

    expect(await transfers.getById("transfer-1")).not.toBeNull();
    expect(await transfers.getById("transfer-2")).not.toBeNull();
  });


  it("rejects both-set and neither-set leg combinations", async () => {
    const testDb = await seedTransferFixture();
    const transfers = new TransferRepository(testDb.db);

    const both = await createTransfer(
      {} as TransferFormState,
      transferFormData({ sourceFixedDepositId: "fd-1" }),
      { db: testDb.db, redirectTo: vi.fn(), newId: () => "transfer-both" }
    );
    const neither = await createTransfer(
      {} as TransferFormState,
      transferFormData({ sourceAccountId: "", sourceFixedDepositId: "" }),
      { db: testDb.db, redirectTo: vi.fn(), newId: () => "transfer-neither" }
    );

    // The leg error still names which side is wrong; it is repository-composed prose,
    // forwarded verbatim through errors.databaseDetail (see src/app/domain-error-text.ts).
    expect(both.formError?.params?.detail).toContain("source");
    expect(neither.formError?.params?.detail).toContain("source");
    expect(await transfers.getById("transfer-both")).toBeNull();
    expect(await transfers.getById("transfer-neither")).toBeNull();
  });

  it("rejects a Transfer whose source and destination Account are the same", async () => {
    const testDb = await seedTransferFixture();
    const transfers = new TransferRepository(testDb.db);

    const result = await createTransfer(
      {} as TransferFormState,
      transferFormData({ destinationAccountId: "acc-1", destinationCurrencyCode: "USD" }),
      { db: testDb.db, redirectTo: vi.fn(), newId: () => "transfer-self" }
    );

    expect(result.formError?.params?.detail).toContain("must not be the same");
    expect(await transfers.getById("transfer-self")).toBeNull();
  });

  it("rejects a Fixed Deposit payout to an Account other than its linked Account", async () => {
    const testDb = await seedTransferFixture();

    const result = await createTransfer(
      {} as TransferFormState,
      transferFormData({
        sourceAccountId: "",
        sourceFixedDepositId: "fd-1",
        sourceCurrencyCode: "INR",
        sourceAmount: "100.00",
        destinationAccountId: "acc-3",
        destinationCurrencyCode: "INR",
        destinationAmount: "100.00"
      }),
      { db: testDb.db, redirectTo: vi.fn(), newId: () => "transfer-invalid" }
    );

    expect(result.formError).toEqual({ key: "errors.databaseDetail", params: { detail: "A Fixed Deposit withdrawal must pay out to its linked Account." } });
    expect(await new TransferRepository(testDb.db).getById("transfer-invalid")).toBeNull();
  });

  it("rejects an empty description without persisting", async () => {
    const testDb = await seedTransferFixture();
    const redirectTo = vi.fn();

    const result = await createTransfer(
      {} as TransferFormState,
      transferFormData({ description: "   " }),
      { db: testDb.db, redirectTo, newId: () => "transfer-empty-desc" }
    );

    expect(result.fieldErrors?.description).toEqual({ key: "errors.descriptionRequired" });
    expect(await new TransferRepository(testDb.db).getById("transfer-empty-desc")).toBeNull();
    expect(redirectTo).not.toHaveBeenCalled();
  });

  it("persists an Account-to-Account Transfer and both ledger Transactions", async () => {
    const testDb = await seedTransferFixture();
    const redirectTo = vi.fn();

    const result = await createTransfer({} as TransferFormState, transferFormData(), {
      db: testDb.db,
      redirectTo,
      newId: () => "transfer-1"
    });

    expect(result).toEqual({});
    expect(await new TransferRepository(testDb.db).getById("transfer-1")).not.toBeNull();
    expect((await new TransactionRepository(testDb.db).listByAccountId("acc-1"))[0]).toMatchObject({
      amountMinor: -10000,
      transferId: "transfer-1"
    });
    expect((await new TransactionRepository(testDb.db).listByAccountId("acc-2"))[0]).toMatchObject({
      amountMinor: 830000,
      transferId: "transfer-1"
    });
    expect(redirectTo).toHaveBeenCalledWith("/transfers/transfer-1?message=transfer_created");
  });

  it("applies Fixed Deposit top-up purpose by increasing principal", async () => {
    const testDb = await seedTransferFixture();
    const result = await createTransfer(
      {} as TransferFormState,
      transferFormData({
        sourceAccountId: "acc-2",
        sourceCurrencyCode: "INR",
        sourceAmount: "100.00",
        destinationAccountId: "",
        destinationFixedDepositId: "fd-1",
        destinationCurrencyCode: "INR",
        destinationAmount: "100.00",
        purpose: "fixed-deposit-top-up"
      }),
      { db: testDb.db, redirectTo: vi.fn(), newId: () => "top-up-1" }
    );

    expect(result).toEqual({});
    expect((await new FixedDepositRepository(testDb.db).getById("fd-1"))?.principalMinor).toBe(840000);
  });

  it("rejects a Fixed Deposit withdrawal above principal", async () => {
    const testDb = await seedTransferFixture();
    const result = await createTransfer(
      {} as TransferFormState,
      transferFormData({
        sourceAccountId: "",
        sourceFixedDepositId: "fd-1",
        sourceCurrencyCode: "INR",
        sourceAmount: "9000.00",
        destinationAccountId: "acc-2",
        destinationFixedDepositId: "",
        destinationCurrencyCode: "INR",
        destinationAmount: "9000.00",
        purpose: "fixed-deposit-withdrawal"
      }),
      { db: testDb.db, redirectTo: vi.fn(), newId: () => "withdrawal-over" }
    );

    expect(result.formError).toEqual({ key: "errors.databaseDetail", params: { detail: "Withdrawal amount cannot exceed the Fixed Deposit current principal." } });
    expect(await new TransferRepository(testDb.db).getById("withdrawal-over")).toBeNull();
  });

  it("rejects same-currency Fixed Deposit Transfers with unequal legs", async () => {
    const testDb = await seedTransferFixture();
    const result = await createTransfer(
      {} as TransferFormState,
      transferFormData({
        sourceAccountId: "acc-2",
        sourceCurrencyCode: "INR",
        sourceAmount: "100.00",
        destinationAccountId: "",
        destinationFixedDepositId: "fd-1",
        destinationCurrencyCode: "INR",
        destinationAmount: "10000.00",
        purpose: "fixed-deposit-top-up"
      }),
      { db: testDb.db, redirectTo: vi.fn(), newId: () => "unequal-topup" }
    );

    expect(result.formError).toEqual({ key: "errors.databaseDetail", params: { detail: "Same-currency Transfer amounts must match on both legs." } });
    expect(await new TransferRepository(testDb.db).getById("unequal-topup")).toBeNull();
  });

  it("rejects an opening Transfer amount that does not match original principal", async () => {
    const testDb = await seedTransferFixture();
    const result = await createTransfer(
      {} as TransferFormState,
      transferFormData({
        sourceAccountId: "acc-2",
        sourceCurrencyCode: "INR",
        sourceAmount: "100.00",
        destinationAccountId: "",
        destinationFixedDepositId: "fd-1",
        destinationCurrencyCode: "INR",
        destinationAmount: "100.00",
        purpose: "fixed-deposit-opening"
      }),
      { db: testDb.db, redirectTo: vi.fn(), newId: () => "bad-opening" }
    );

    expect(result.formError).toEqual({ key: "errors.databaseDetail", params: { detail: "Opening Transfer amount must match the Fixed Deposit original principal." } });
    expect(await new TransferRepository(testDb.db).getById("bad-opening")).toBeNull();
  });

  it("defaults Account-to-Fixed Deposit Transfers without an explicit purpose to top-up", async () => {
    const testDb = await seedTransferFixture();
    const result = await createTransfer(
      {} as TransferFormState,
      transferFormData({
        sourceAccountId: "acc-2",
        sourceCurrencyCode: "INR",
        sourceAmount: "100.00",
        destinationAccountId: "",
        destinationFixedDepositId: "fd-1",
        destinationCurrencyCode: "INR",
        destinationAmount: "100.00",
        purpose: ""
      }),
      { db: testDb.db, redirectTo: vi.fn(), newId: () => "inferred-topup" }
    );

    expect(result).toEqual({});
    expect(await new TransferRepository(testDb.db).getById("inferred-topup")).toMatchObject({
      purpose: "fixed-deposit-top-up"
    });
    expect((await new FixedDepositRepository(testDb.db).getById("fd-1"))?.principalMinor).toBe(
      840000
    );
  });

  it("persists to the Postgres repository, scoped to the owner, when an owner is resolved", async () => {
    const ownerId = randomUUID();
    const institution = { id: randomUUID(), name: "Cloud Bank" };
    const accountA = {
      id: randomUUID(),
      institutionId: institution.id,
      name: "Checking",
      accountNumber: null,
      currencyCode: "INR"
    };
    const accountB = {
      id: randomUUID(),
      institutionId: institution.id,
      name: "Savings",
      accountNumber: null,
      currencyCode: "INR"
    };
    await new PgInstitutionRepository(TEST_DATABASE_URL, ownerId).create(institution);
    await new PgAccountRepository(TEST_DATABASE_URL, ownerId).create(accountA);
    await new PgAccountRepository(TEST_DATABASE_URL, ownerId).create(accountB);
    const id = randomUUID();
    const redirectTo = vi.fn();

    try {
      const result = await createTransfer(
        {} as TransferFormState,
        transferFormData({
          sourceAccountId: accountA.id,
          sourceCurrencyCode: "INR",
          sourceAmount: "100.00",
          destinationAccountId: accountB.id,
          destinationCurrencyCode: "INR",
          destinationAmount: "100.00",
          purpose: "general"
        }),
        {
          getCurrentOwnerId: async () => ownerId,
          isCloudMode: () => true,
          postgresConnectionString: TEST_DATABASE_URL,
          redirectTo,
          newId: () => id
        }
      );

      expect(result).toEqual({});
      const pgTransfers = new PgTransferRepository(TEST_DATABASE_URL, ownerId);
      expect(await pgTransfers.getById(id)).toMatchObject({
        id,
        sourceAccountId: accountA.id,
        destinationAccountId: accountB.id
      });
      expect(redirectTo).toHaveBeenCalledWith(`/transfers/${id}?message=transfer_created`);
    } finally {
      const admin = postgres(TEST_DATABASE_URL, { max: 1 });
      await admin`delete from transactions where transfer_id = ${id}`;
      await admin`delete from transfers where id = ${id}`;
      await admin`delete from accounts where id in (${accountA.id}, ${accountB.id})`;
      await admin`delete from institutions where id = ${institution.id}`;
      await admin.end();
    }
  });
});
