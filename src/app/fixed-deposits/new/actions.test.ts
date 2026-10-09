import { randomUUID } from "node:crypto";

import postgres from "postgres";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { TEXT_FIELD_MAX_LENGTH } from "@/app/form-limits";

import {
  createFixedDeposit,
  type FixedDepositFormState
} from "@/app/fixed-deposits/new/actions";
import { resetIdempotencyKeysForTests } from "@/app/duplicate-submission-guard";
import { PgAccountRepository } from "@/db/postgres/repositories/account-repository";
import { PgFixedDepositRepository } from "@/db/postgres/repositories/fixed-deposit-repository";
import { PgInstitutionRepository } from "@/db/postgres/repositories/institution-repository";
import { AccountRepository } from "@/db/repositories/account-repository";
import { FixedDepositRepository } from "@/db/repositories/fixed-deposit-repository";
import { InstitutionRepository } from "@/db/repositories/institution-repository";
import { TransactionRepository } from "@/db/repositories/transaction-repository";
import { TransferRepository } from "@/db/repositories/transfer-repository";
import { createTestDb } from "@/db/repositories/test-db";

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

function fixedDepositFormData(overrides: Partial<Record<string, string>> = {}) {
  const values = {
    institutionId: "inst-1",
    linkedAccountId: "acc-1",
    name: "1-year FD",
    principal: "100000.00",
    interestRate: "6.50",
    openedDate: "2026-01-01",
    maturityDate: "2027-01-01",
    ...overrides
  };
  const formData = new FormData();
  for (const [key, value] of Object.entries(values)) {
    formData.set(key, value);
  }
  return formData;
}

function sequentialIds(...ids: string[]) {
  let index = 0;
  return () => ids[index++] ?? `unexpected-id-${index}`;
}

async function seedReferences() {
  const testDb = createTestDb();
  await new InstitutionRepository(testDb.db).create({ id: "inst-1", name: "Institution One" });
  await new AccountRepository(testDb.db).create({
    id: "acc-1",
    institutionId: "inst-1",
    name: "Everyday account",
    accountNumber: null,
    currencyCode: "INR"
  });
  return testDb;
}

describe("createFixedDeposit", () => {
  beforeEach(() => {
    resetIdempotencyKeysForTests();
  });

  it("rejects a duplicate submission carrying the same idempotencyKey — the double-click/back-button-resubmit guard every other create action has", async () => {
    const testDb = await seedReferences();
    const fixedDeposits = new FixedDepositRepository(testDb.db);

    const first = fixedDepositFormData({ debitNow: "on" });
    first.set("idempotencyKey", "same-key");
    const firstResult = await createFixedDeposit({} as FixedDepositFormState, first, {
      db: testDb.db,
      redirectTo: vi.fn(),
      newId: sequentialIds("fd-dup-1", "transfer-dup-1", "txn-dup-1")
    });
    expect(firstResult.formError).toBeUndefined();

    const second = fixedDepositFormData({ debitNow: "on" });
    second.set("idempotencyKey", "same-key");
    const secondResult = await createFixedDeposit({} as FixedDepositFormState, second, {
      db: testDb.db,
      redirectTo: vi.fn(),
      newId: sequentialIds("fd-dup-2", "transfer-dup-2", "txn-dup-2")
    });

    expect(secondResult.formError).toEqual({ key: "errors.fixedDepositDuplicateSubmission" });
    expect(await fixedDeposits.listAll()).toHaveLength(1);
    // Only one opening debit was made against the linked Account — a
    // resubmitted debitNow=true create must not double-debit it.
    expect(await new TransactionRepository(testDb.db).listByAccountId("acc-1")).toHaveLength(1);
  });

  it("rejects an empty name before persisting", async () => {
    const testDb = await seedReferences();
    const fixedDeposits = new FixedDepositRepository(testDb.db);

    const result = await createFixedDeposit(
      {} as FixedDepositFormState,
      fixedDepositFormData({ name: "   " }),
      { db: testDb.db, redirectTo: vi.fn(), newId: () => "fd-empty-name" }
    );

    expect(result.fieldErrors?.name).toEqual({ key: "errors.nameRequired" });
    expect(await fixedDeposits.listAll()).toEqual([]);
  });

  it("rejects an oversized name before persisting", async () => {
    const testDb = await seedReferences();
    const fixedDeposits = new FixedDepositRepository(testDb.db);

    const result = await createFixedDeposit(
      {} as FixedDepositFormState,
      fixedDepositFormData({ name: "x".repeat(61) }),
      { db: testDb.db, redirectTo: vi.fn(), newId: () => "fd-long-name" }
    );

    expect(result.fieldErrors?.name).toEqual({
      key: "errors.textTooLong",
      params: { max: TEXT_FIELD_MAX_LENGTH }
    });
    expect(await fixedDeposits.listAll()).toEqual([]);
  });

  it("persists an optional account number and rejects an oversized one", async () => {
    const testDb = await seedReferences();
    const fixedDeposits = new FixedDepositRepository(testDb.db);

    const oversized = await createFixedDeposit(
      {} as FixedDepositFormState,
      fixedDepositFormData({ accountNumber: "x".repeat(61) }),
      { db: testDb.db, redirectTo: vi.fn(), newId: () => "fd-long-number" }
    );
    expect(oversized.fieldErrors?.accountNumber).toEqual({
      key: "errors.textTooLong",
      params: { max: TEXT_FIELD_MAX_LENGTH }
    });
    expect(await fixedDeposits.listAll()).toEqual([]);

    const redirectTo = vi.fn();
    const result = await createFixedDeposit(
      {} as FixedDepositFormState,
      fixedDepositFormData({ accountNumber: " FD-998877 " }),
      { db: testDb.db, redirectTo, newId: () => "fd-numbered" }
    );
    expect(result).toEqual({});
    expect(await fixedDeposits.getById("fd-numbered")).toMatchObject({
      accountNumber: "FD-998877"
    });
  });

  it("rejects non-positive principal before persisting", async () => {
    const testDb = await seedReferences();
    const fixedDeposits = new FixedDepositRepository(testDb.db);

    const zero = await createFixedDeposit(
      {} as FixedDepositFormState,
      fixedDepositFormData({ principal: "0" }),
      { db: testDb.db, redirectTo: vi.fn(), newId: () => "fd-zero" }
    );
    const negative = await createFixedDeposit(
      {} as FixedDepositFormState,
      fixedDepositFormData({ principal: "-100" }),
      { db: testDb.db, redirectTo: vi.fn(), newId: () => "fd-neg" }
    );

    expect(zero.fieldErrors?.principal).toEqual({ key: "errors.principalNotPositive" });
    expect(negative.fieldErrors?.principal).toEqual({ key: "errors.principalNotPositive" });
    expect(await fixedDeposits.listAll()).toEqual([]);
  });

  it("rejects a linked Account from a different Institution", async () => {
    const testDb = await seedReferences();
    await new InstitutionRepository(testDb.db).create({ id: "inst-2", name: "Other" });
    await new AccountRepository(testDb.db).create({
      id: "acc-2",
      institutionId: "inst-2",
      name: "Other account",
      accountNumber: null,
      currencyCode: "INR"
    });
    const fixedDeposits = new FixedDepositRepository(testDb.db);

    const result = await createFixedDeposit(
      {} as FixedDepositFormState,
      fixedDepositFormData({ linkedAccountId: "acc-2" }),
      { db: testDb.db, redirectTo: vi.fn(), newId: () => "fd-cross" }
    );

    expect(result.fieldErrors?.linkedAccountId).toEqual({ key: "errors.linkedAccountInstitutionMismatch" });
    expect(await fixedDeposits.listAll()).toEqual([]);
  });

  it("rejects malformed principal and negative interest before persisting", async () => {
    const testDb = await seedReferences();
    const fixedDeposits = new FixedDepositRepository(testDb.db);

    const badPrincipal = await createFixedDeposit(
      {} as FixedDepositFormState,
      fixedDepositFormData({ principal: "10.001" }),
      { db: testDb.db, redirectTo: vi.fn(), newId: () => "fd-1" }
    );
    const badRate = await createFixedDeposit(
      {} as FixedDepositFormState,
      fixedDepositFormData({ interestRate: "-1" }),
      { db: testDb.db, redirectTo: vi.fn(), newId: () => "fd-2" }
    );

    expect(badPrincipal.fieldErrors?.principal).toEqual({ key: "errors.principalInvalid" });
    expect(badRate.fieldErrors?.interestRate).toEqual({ key: "errors.interestRateInvalid" });
    expect(await fixedDeposits.listAll()).toEqual([]);
  });

  it("rejects unknown references without persisting", async () => {
    const testDb = await seedReferences();
    const fixedDeposits = new FixedDepositRepository(testDb.db);

    const result = await createFixedDeposit(
      {} as FixedDepositFormState,
      fixedDepositFormData({ linkedAccountId: "missing" }),
      { db: testDb.db, redirectTo: vi.fn(), newId: () => "fd-1" }
    );

    expect(result).toMatchObject({
      formError: { key: "errors.fixedDepositLinkMissing" }
    });
    expect(result.values).toBeDefined();
    expect(result.formKey).toBeTruthy();
    expect(await fixedDeposits.listAll()).toEqual([]);
  });

  it("derives currency from the linked Account and does not debit it when debitNow is unchecked", async () => {
    const testDb = await seedReferences();
    const fixedDeposits = new FixedDepositRepository(testDb.db);
    const redirectTo = vi.fn();

    const result = await createFixedDeposit(
      {} as FixedDepositFormState,
      fixedDepositFormData(),
      { db: testDb.db, redirectTo, newId: () => "fd-1" }
    );

    expect(result).toEqual({});
    expect(await fixedDeposits.getById("fd-1")).toEqual({
      id: "fd-1",
      name: "1-year FD",
      accountNumber: null,
      institutionId: "inst-1",
      linkedAccountId: "acc-1",
      principalMinor: 10000000,
      originalPrincipalMinor: 10000000,
      currencyCode: "INR",
      interestRateBps: 650,
      openedDate: "2026-01-01",
      maturityDate: "2027-01-01",
      status: "Open"
    });
    expect(await new TransferRepository(testDb.db).listByLeg("fd-1")).toEqual([]);
    expect(await new TransactionRepository(testDb.db).listByAccountId("acc-1")).toEqual([]);
    expect(redirectTo).toHaveBeenCalledWith("/fixed-deposits/fd-1?message=fixed_deposit_created");
  });

  it("debits the linked Account via an opening Transfer when debitNow is checked", async () => {
    const testDb = await seedReferences();
    const redirectTo = vi.fn();

    const result = await createFixedDeposit(
      {} as FixedDepositFormState,
      fixedDepositFormData({ debitNow: "on" }),
      {
        db: testDb.db,
        redirectTo,
        newId: sequentialIds("fd-1", "transfer-1", "txn-1")
      }
    );

    expect(result).toEqual({});
    expect(await new TransferRepository(testDb.db).getById("transfer-1")).toEqual({
      id: "transfer-1",
      sourceAccountId: "acc-1",
      sourceFixedDepositId: null,
      sourceAmountMinor: 10000000,
      sourceCurrencyCode: "INR",
      destinationAccountId: null,
      destinationFixedDepositId: "fd-1",
      destinationAmountMinor: 10000000,
      destinationCurrencyCode: "INR",
      occurredAt: "2026-01-01T00:00:00.000Z",
      description: "Opening deposit",
      purpose: "fixed-deposit-opening"
    });
    expect(await new TransactionRepository(testDb.db).listByAccountId("acc-1")).toEqual([
      {
        id: "txn-1",
        accountId: "acc-1",
        amountMinor: -10000000,
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

  it("persists to the Postgres repository, scoped to the owner, when an owner is resolved", async () => {
    const ownerId = randomUUID();
    const institution = { id: randomUUID(), name: "Cloud Bank" };
    const account = {
      id: randomUUID(),
      institutionId: institution.id,
      name: "Everyday account",
      accountNumber: null,
      currencyCode: "INR"
    };
    await new PgInstitutionRepository(TEST_DATABASE_URL, ownerId).create(institution);
    await new PgAccountRepository(TEST_DATABASE_URL, ownerId).create(account);
    const id = randomUUID();
    const redirectTo = vi.fn();

    try {
      const result = await createFixedDeposit(
        {} as FixedDepositFormState,
        fixedDepositFormData({ institutionId: institution.id, linkedAccountId: account.id }),
        {
          getCurrentOwnerId: async () => ownerId,
          isCloudMode: () => true,
          postgresConnectionString: TEST_DATABASE_URL,
          redirectTo,
          newId: () => id
        }
      );

      expect(result).toEqual({});
      const pgFixedDeposits = new PgFixedDepositRepository(TEST_DATABASE_URL, ownerId);
      expect(await pgFixedDeposits.getById(id)).toMatchObject({
        id,
        institutionId: institution.id,
        linkedAccountId: account.id,
        principalMinor: 10000000
      });
      expect(redirectTo).toHaveBeenCalledWith(`/fixed-deposits/${id}?message=fixed_deposit_created`);
    } finally {
      const admin = postgres(TEST_DATABASE_URL, { max: 1 });
      await admin`delete from fixed_deposits where id = ${id}`;
      await admin`delete from accounts where id = ${account.id}`;
      await admin`delete from institutions where id = ${institution.id}`;
      await admin.end();
    }
  });
});
