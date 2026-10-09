/**
 * Ad-hoc functional QA — probes edge cases across all UI server actions.
 * Findings are captured separately in docs/functional-test-issues.md.
 */
import { describe, expect, it, vi } from "vitest";

import { createAccount } from "@/app/accounts/new/actions";
import { reconcileAccount } from "@/app/accounts/[id]/reconcile/actions";
import { createTransaction } from "@/app/accounts/[id]/transactions/new/actions";
import { createFixedDeposit } from "@/app/fixed-deposits/new/actions";
import { createInstitution } from "@/app/institutions/new/actions";
import { resolveDiscrepancy } from "@/app/reconciliations/[id]/resolve-actions";
import { createTransfer } from "@/app/transfers/new/actions";
import { AccountRepository } from "@/db/repositories/account-repository";
import { FixedDepositRepository } from "@/db/repositories/fixed-deposit-repository";
import { InstitutionRepository } from "@/db/repositories/institution-repository";
import { ReconciliationRepository } from "@/db/repositories/reconciliation-repository";
import { TransactionRepository } from "@/db/repositories/transaction-repository";
import { TransferRepository } from "@/db/repositories/transfer-repository";
import { createTestDb } from "@/db/repositories/test-db";
import { realizedFxRate } from "@/domain/transfer";

async function seedBase() {
  const testDb = createTestDb();
  await new InstitutionRepository(testDb.db).create({ id: "inst-1", name: "Test Bank" });
  await new AccountRepository(testDb.db).create({
    id: "acc-1",
    institutionId: "inst-1",
    name: "Savings",
    accountNumber: null,
    currencyCode: "INR"
  });
  await new AccountRepository(testDb.db).create({
    id: "acc-2",
    institutionId: "inst-1",
    name: "USD Wallet",
    accountNumber: null,
    currencyCode: "USD"
  });
  return testDb;
}

describe("functional QA — edge cases", () => {
  it("transfer: same account as source and destination is rejected", async () => {
    // Was "is accepted" — a same-Account Transfer used to persist as two
    // offsetting ±amount Transactions on one Account under a single
    // description, a confusing no-op entity a user could create by mistake.
    // assertValidTransferLegs() now rejects a source/destination pair that
    // references the same Account or FixedDeposit.
    const testDb = await seedBase();
    const redirectTo = vi.fn();
    const formData = new FormData();
    formData.set("sourceAccountId", "acc-1");
    formData.set("sourceFixedDepositId", "");
    formData.set("sourceAmount", "100.00");
    formData.set("sourceCurrencyCode", "INR");
    formData.set("destinationAccountId", "acc-1");
    formData.set("destinationFixedDepositId", "");
    formData.set("destinationAmount", "100.00");
    formData.set("destinationCurrencyCode", "INR");
    formData.set("occurredAt", "2026-09-05T09:30");
    formData.set("description", "Self transfer");

    const result = await createTransfer({}, formData, {
      db: testDb.db,
      redirectTo,
      newId: () => "transfer-self"
    });

    expect(result.formError).toEqual({
      key: "errors.databaseDetail",
      params: { detail: "Transfer source and destination must not be the same." }
    });
    expect(redirectTo).not.toHaveBeenCalled();
    expect(await new TransferRepository(testDb.db).getById("transfer-self")).toBeNull();
  });

  it("transfer: zero source amount is rejected", async () => {
    // Was "is accepted" — a zero-amount general Transfer used to persist with
    // a 0/0 realized FX rate, rendering the literal string "NaN" on the
    // Transfer detail page (see docs/qa/fixed-deposit-test-cases.md FD-OPEN-10).
    // assertValidTransferAmounts() now requires positive amounts on every
    // purpose, not just FixedDeposit ones.
    const testDb = await seedBase();
    const redirectTo = vi.fn();
    const formData = new FormData();
    formData.set("sourceAccountId", "acc-1");
    formData.set("sourceFixedDepositId", "");
    formData.set("sourceAmount", "0.00");
    formData.set("sourceCurrencyCode", "INR");
    formData.set("destinationAccountId", "acc-2");
    formData.set("destinationFixedDepositId", "");
    formData.set("destinationAmount", "0.00");
    formData.set("destinationCurrencyCode", "USD");
    formData.set("occurredAt", "2026-09-05T09:30");
    formData.set("description", "Zero transfer");

    const result = await createTransfer({}, formData, {
      db: testDb.db,
      redirectTo,
      newId: () => "transfer-zero"
    });

    expect(result.formError).toEqual({ key: "errors.databaseDetail", params: { detail: "Transfer amounts must be greater than zero." } });
    expect(redirectTo).not.toHaveBeenCalled();
  });

  it("transfer: invalid occurredAt returns a field error instead of throwing", async () => {
    const testDb = await seedBase();
    const formData = new FormData();
    formData.set("sourceAccountId", "acc-1");
    formData.set("sourceFixedDepositId", "");
    formData.set("sourceAmount", "10.00");
    formData.set("sourceCurrencyCode", "INR");
    formData.set("destinationAccountId", "acc-2");
    formData.set("destinationFixedDepositId", "");
    formData.set("destinationAmount", "1.00");
    formData.set("destinationCurrencyCode", "USD");
    formData.set("occurredAt", "not-a-date");
    formData.set("description", "Bad timestamp");

    const result = await createTransfer({}, formData, {
      db: testDb.db,
      redirectTo: vi.fn(),
      newId: () => "transfer-bad-date"
    });

    expect(result.fieldErrors?.occurredAt).toBeDefined();
    expect(await new TransferRepository(testDb.db).getById("transfer-bad-date")).toBeNull();
  });

  it("transfer: mismatched source currency is rejected with a form error", async () => {
    const testDb = await seedBase();
    const formData = new FormData();
    formData.set("sourceAccountId", "acc-1");
    formData.set("sourceFixedDepositId", "");
    formData.set("sourceAmount", "10.00");
    formData.set("sourceCurrencyCode", "USD");
    formData.set("destinationAccountId", "acc-2");
    formData.set("destinationFixedDepositId", "");
    formData.set("destinationAmount", "1.00");
    formData.set("destinationCurrencyCode", "USD");
    formData.set("occurredAt", "2026-09-05T09:30");
    formData.set("description", "Bad currency");

    const result = await createTransfer({}, formData, {
      db: testDb.db,
      redirectTo: vi.fn(),
      newId: () => "transfer-bad-currency"
    });

    expect(result.formError).toBeDefined();
    expect(await new TransferRepository(testDb.db).getById("transfer-bad-currency")).toBeNull();
  });

  it("transaction: zero amount is accepted", async () => {
    const testDb = await seedBase();
    const formData = new FormData();
    formData.set("accountId", "acc-1");
    formData.set("amount", "0.00");
    formData.set("kind", "Expense");
    formData.set("category", "Other");
    formData.set("occurredAt", "2026-09-05T09:30");
    formData.set("description", "Zero txn");

    const result = await createTransaction({}, formData, {
      db: testDb.db,
      redirectTo: vi.fn(),
      newId: () => "txn-zero"
    });

    expect(result).toEqual({});
  });

  it("transaction: empty description is rejected", async () => {
    // Was "is accepted" — the form marks Description required (asterisk),
    // but createTransaction only checked textFieldLengthError() (max length),
    // never emptiness, so a whitespace-only description silently persisted a
    // blank ledger entry. Same gap existed in updateTransaction and both
    // createTransfer/updateTransfer. All four now reject it explicitly.
    const testDb = await seedBase();
    const formData = new FormData();
    formData.set("accountId", "acc-1");
    formData.set("amount", "10.00");
    formData.set("kind", "Income");
    formData.set("category", "Salary");
    formData.set("occurredAt", "2026-09-05T09:30");
    formData.set("description", "   ");

    const result = await createTransaction({}, formData, {
      db: testDb.db,
      redirectTo: vi.fn(),
      newId: () => "txn-empty-desc"
    });

    expect(result.fieldErrors?.description).toEqual({ key: "errors.descriptionRequired" });
    const txn = (await new TransactionRepository(testDb.db).listByAccountId("acc-1")).find(
      (t) => t.id === "txn-empty-desc"
    );
    expect(txn).toBeUndefined();
  });

  it("fixed deposit: invalid date strings are rejected with field errors", async () => {
    const testDb = await seedBase();
    const formData = new FormData();
    formData.set("institutionId", "inst-1");
    formData.set("linkedAccountId", "acc-1");
    formData.set("name", "Test FD");
    formData.set("principal", "10000.00");
    formData.set("currencyCode", "INR");
    formData.set("interestRate", "6.50");
    formData.set("openedDate", "not-a-date");
    formData.set("maturityDate", "2026-13-45");

    const result = await createFixedDeposit({}, formData, {
      db: testDb.db,
      redirectTo: vi.fn(),
      newId: () => "fd-bad-dates"
    });

    expect(result.fieldErrors?.openedDate).toBeDefined();
    expect(await new FixedDepositRepository(testDb.db).getById("fd-bad-dates")).toBeNull();
  });

  it("fixed deposit: maturity before opening date is rejected", async () => {
    const testDb = await seedBase();
    const formData = new FormData();
    formData.set("institutionId", "inst-1");
    formData.set("linkedAccountId", "acc-1");
    formData.set("name", "Test FD");
    formData.set("principal", "10000.00");
    formData.set("currencyCode", "INR");
    formData.set("interestRate", "6.50");
    formData.set("openedDate", "2027-01-01");
    formData.set("maturityDate", "2026-01-01");

    const result = await createFixedDeposit({}, formData, {
      db: testDb.db,
      redirectTo: vi.fn(),
      newId: () => "fd-inverted-dates"
    });

    expect(result.fieldErrors?.maturityDate).toBeDefined();
    expect(await new FixedDepositRepository(testDb.db).getById("fd-inverted-dates")).toBeNull();
  });

  it("reconcile: invalid asOfDate is rejected instead of silently zeroing the computed balance", async () => {
    const testDb = await seedBase();
    const formData = new FormData();
    formData.set("accountId", "acc-1");
    formData.set("balance", "1000.00");
    formData.set("asOfDate", "garbage");

    const result = await reconcileAccount({}, formData, {
      db: testDb.db,
      redirectTo: vi.fn(),
      newId: () => "snap-bad-date",
      now: () => "2026-09-05T00:00:00.000Z"
    });

    expect(result.fieldErrors?.asOfDate).toBeDefined();
    expect(await new ReconciliationRepository(testDb.db).getById("snap-bad-date")).toBeNull();
  });

  it("resolve: an already-resolved discrepancy rejects a second resolution", async () => {
    const testDb = await seedBase();
    await new TransactionRepository(testDb.db).create({
      id: "txn-1",
      accountId: "acc-1",
      amountMinor: 100_000,
      occurredAt: "2026-01-10T00:00:00.000Z",
      description: "Deposit",
      trustStatus: "Confirmed",
      transferId: null,
      category: null,
      importBatchId: null
    });
    const { BalanceSnapshotRepository } = await import(
      "@/db/repositories/balance-snapshot-repository"
    );
    await new BalanceSnapshotRepository(testDb.db).create({
      id: "snap-1",
      accountId: "acc-1",
      asOfDate: "2026-01-31",
      balanceMinor: 105_000
    });
    await new ReconciliationRepository(testDb.db).create({
      id: "recon-1",
      accountId: "acc-1",
      balanceSnapshotId: "snap-1",
      reconciledAt: "2026-02-01T00:00:00.000Z"
    });

    const first = new FormData();
    first.set("reconciliationId", "recon-1");
    first.set("discrepancyId", "recon-1-discrepancy");
    first.set("resolution", "disputed-with-bank");
    await resolveDiscrepancy({}, first, { db: testDb.db, refresh: vi.fn() });

    const second = new FormData();
    second.set("reconciliationId", "recon-1");
    second.set("discrepancyId", "recon-1-discrepancy");
    second.set("resolution", "corrected-my-record");
    second.set("amount", "50.00");
    second.set("description", "Second resolution");

    const result = await resolveDiscrepancy({}, second, {
      db: testDb.db,
      refresh: vi.fn(),
      newId: () => "adj-txn-2",
      now: () => "2026-02-02T00:00:00.000Z"
    });

    expect(result.formError).toBeDefined();
    const discrepancy = await new ReconciliationRepository(
      testDb.db
    ).getDiscrepancyByReconciliationId("recon-1");
    expect(discrepancy?.resolution).toBe("disputed-with-bank");
    const { AdjustmentRepository } = await import("@/db/repositories/adjustment-repository");
    expect(
      await new AdjustmentRepository(testDb.db).getByDiscrepancyId("recon-1-discrepancy")
    ).toBeNull();
  });

  it("resolve: open discrepancy count ignores disputed-with-bank", async () => {
    const testDb = await seedBase();
    await new TransactionRepository(testDb.db).create({
      id: "txn-1",
      accountId: "acc-1",
      amountMinor: 100_000,
      occurredAt: "2026-01-10T00:00:00.000Z",
      description: "Deposit",
      trustStatus: "Confirmed",
      transferId: null,
      category: null,
      importBatchId: null
    });
    const { BalanceSnapshotRepository } = await import(
      "@/db/repositories/balance-snapshot-repository"
    );
    await new BalanceSnapshotRepository(testDb.db).create({
      id: "snap-1",
      accountId: "acc-1",
      asOfDate: "2026-01-31",
      balanceMinor: 105_000
    });
    await new ReconciliationRepository(testDb.db).create({
      id: "recon-1",
      accountId: "acc-1",
      balanceSnapshotId: "snap-1",
      reconciledAt: "2026-02-01T00:00:00.000Z"
    });

    const formData = new FormData();
    formData.set("reconciliationId", "recon-1");
    formData.set("discrepancyId", "recon-1-discrepancy");
    formData.set("resolution", "disputed-with-bank");
    await resolveDiscrepancy({}, formData, { db: testDb.db, refresh: vi.fn() });

    const discrepancy = await new ReconciliationRepository(testDb.db).getDiscrepancyByReconciliationId(
      "recon-1"
    );
    expect(discrepancy?.resolution).toBe("disputed-with-bank");
    expect(discrepancy?.resolution === null).toBe(false);
  });

  it("realizedFxRate divides by zero when source amount is zero", async () => {
    const rate = realizedFxRate({
      id: "t",
      sourceAccountId: "a",
      sourceFixedDepositId: null,
      sourceAmountMinor: 0,
      sourceCurrencyCode: "INR",
      destinationAccountId: "b",
      destinationFixedDepositId: null,
      destinationAmountMinor: 10000,
      destinationCurrencyCode: "USD",
      occurredAt: "2026-01-01",
      description: "x",
      purpose: "general"
    });
    expect(Number.isFinite(rate)).toBe(false);
  });

  it("account: lowercase currency code rejected but not auto-corrected", async () => {
    const testDb = createTestDb();
    await new InstitutionRepository(testDb.db).create({ id: "inst-1", name: "Bank" });
    const formData = new FormData();
    formData.set("institutionId", "inst-1");
    formData.set("name", "Account");
    formData.set("currencyCode", "inr");

    const result = await createAccount({}, formData, { db: testDb.db, redirectTo: vi.fn() });
    expect(result.fieldErrors?.currencyCode).toBeDefined();
  });

  it("institution: duplicate names are allowed", async () => {
    const testDb = createTestDb();
    const firstFormData = new FormData();
    firstFormData.set("name", "Same Name");
    await createInstitution({}, firstFormData, {
      db: testDb.db,
      redirectTo: vi.fn(),
      newId: () => "inst-1"
    });
    const redirectTo = vi.fn();
    const secondFormData = new FormData();
    secondFormData.set("name", "Same Name");
    await createInstitution({}, secondFormData, {
      db: testDb.db,
      redirectTo,
      newId: () => "inst-2"
    });
    expect(redirectTo).toHaveBeenCalled();
    expect(await new InstitutionRepository(testDb.db).listAll()).toHaveLength(2);
  });

  it("fixed deposit: linked account from different institution is rejected", async () => {
    const testDb = createTestDb();
    await new InstitutionRepository(testDb.db).create({ id: "inst-1", name: "Bank A" });
    await new InstitutionRepository(testDb.db).create({ id: "inst-2", name: "Bank B" });
    await new AccountRepository(testDb.db).create({
      id: "acc-b",
      institutionId: "inst-2",
      name: "Other bank account",
      accountNumber: null,
      currencyCode: "INR"
    });
    const formData = new FormData();
    formData.set("institutionId", "inst-1");
    formData.set("linkedAccountId", "acc-b");
    formData.set("name", "Test FD");
    formData.set("principal", "10000.00");
    formData.set("currencyCode", "INR");
    formData.set("interestRate", "6.50");
    formData.set("openedDate", "2026-01-01");
    formData.set("maturityDate", "2027-01-01");

    const result = await createFixedDeposit({}, formData, {
      db: testDb.db,
      redirectTo: vi.fn(),
      newId: () => "fd-cross-inst"
    });

    expect(result.fieldErrors?.linkedAccountId).toBeDefined();
    expect(await new FixedDepositRepository(testDb.db).getById("fd-cross-inst")).toBeNull();
  });

  it("transfer: mature already-matured fixed deposit fails", async () => {
    const testDb = await seedBase();
    await new FixedDepositRepository(testDb.db).create({
      id: "fd-matured",
      name: "Matured term deposit",
      accountNumber: null,
      institutionId: "inst-1",
      linkedAccountId: "acc-1",
      principalMinor: 100_000,
      originalPrincipalMinor: 100_000,
      currencyCode: "INR",
      interestRateBps: 650,
      openedDate: "2026-01-01",
      maturityDate: "2027-01-01",
      status: "Matured"
    });
    const formData = new FormData();
    formData.set("sourceAccountId", "");
    formData.set("sourceFixedDepositId", "fd-matured");
    formData.set("sourceAmount", "1000.00");
    formData.set("sourceCurrencyCode", "INR");
    formData.set("destinationAccountId", "acc-1");
    formData.set("destinationFixedDepositId", "");
    formData.set("destinationAmount", "1000.00");
    formData.set("destinationCurrencyCode", "INR");
    formData.set("occurredAt", "2026-09-05T09:30");
    formData.set("description", "Double maturity");

    const result = await createTransfer({}, formData, {
      db: testDb.db,
      redirectTo: vi.fn(),
      newId: () => "transfer-double-maturity"
    });

    expect(result.formError).toBeDefined();
  });
});
