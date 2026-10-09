/**
 * Direct-call verification of an exceptional-scenario list for Transfer/Transaction
 * add, delete, duplicate, and edit — run against the real Server Actions and
 * repositories (no browser), per the same pattern as screen-qa.test.ts.
 *
 * B13, D17, and D18 originally documented confirmed bugs and have since been
 * fixed (see runDatabaseWrite, deleteTransfer, and
 * TransferRepository.validateTransferInvariants); their assertions now cover
 * the corrected behavior. C14/C15 document both the pre-fix gap (no
 * idempotencyKey supplied) and the fix (claimIdempotencyKey via
 * duplicate-submission-guard.ts) side by side.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { createTransfer } from "@/app/transfers/new/actions";
import { updateTransfer } from "@/app/transfers/[id]/edit/actions";
import { deleteTransfer } from "@/app/transfers/[id]/delete-actions";
import { createTransaction } from "@/app/accounts/[id]/transactions/new/actions";
import { resetIdempotencyKeysForTests } from "@/app/duplicate-submission-guard";
import { AccountRepository } from "@/db/repositories/account-repository";
import { FixedDepositRepository } from "@/db/repositories/fixed-deposit-repository";
import { InstitutionRepository } from "@/db/repositories/institution-repository";
import { TransactionRepository } from "@/db/repositories/transaction-repository";
import { TransferRepository } from "@/db/repositories/transfer-repository";
import { createTestDb } from "@/db/repositories/test-db";

async function freshFixture() {
  const testDb = createTestDb();
  const institutions = new InstitutionRepository(testDb.db);
  const accounts = new AccountRepository(testDb.db);
  const fixedDeposits = new FixedDepositRepository(testDb.db);
  await institutions.create({ id: "inst-1", name: "Test Bank" });
  await accounts.create({ id: "acc-inr", institutionId: "inst-1", name: "INR Acc", accountNumber: null, currencyCode: "INR" });
  await accounts.create({ id: "acc-inr2", institutionId: "inst-1", name: "INR Acc 2", accountNumber: null, currencyCode: "INR" });
  await accounts.create({ id: "acc-usd", institutionId: "inst-1", name: "USD Acc", accountNumber: null, currencyCode: "USD" });
  return { testDb, institutions, accounts, fixedDeposits };
}

// Principal is ₹1,00,000.00 (10,000,000 minor units — INR has 2 decimal places).
// Every decimal-string amount below a test passes to a form is a plain rupee
// figure at this same scale, so e.g. "100000" means ₹1,00,000 = the full principal.
const FD_PRINCIPAL_MINOR = 10_000_000;

async function makeFd(fixedDeposits: FixedDepositRepository, overrides: Partial<Parameters<FixedDepositRepository["create"]>[0]> = {}) {
  return fixedDeposits.create({
    id: "fd-1",
    name: "FD1",
    accountNumber: null,
    institutionId: "inst-1",
    linkedAccountId: "acc-inr",
    principalMinor: FD_PRINCIPAL_MINOR,
    originalPrincipalMinor: FD_PRINCIPAL_MINOR,
    currencyCode: "INR",
    interestRateBps: 650,
    openedDate: "2026-01-01",
    maturityDate: "2027-01-01",
    status: "Open",
    ...overrides
  });
}

function transferFD(overrides: Partial<Record<string, string>> = {}) {
  const values: Record<string, string> = {
    sourceAccountId: "acc-inr",
    sourceFixedDepositId: "",
    sourceAmount: "100.00",
    sourceCurrencyCode: "INR",
    destinationAccountId: "acc-inr2",
    destinationFixedDepositId: "",
    destinationAmount: "100.00",
    destinationCurrencyCode: "INR",
    occurredAt: "2026-09-05T09:30",
    description: "Test transfer",
    purpose: "",
    ...overrides
  };
  const fd = new FormData();
  for (const [k, v] of Object.entries(values)) fd.set(k, v);
  return fd;
}

function deleteForm(transferId: string) {
  const fd = new FormData();
  fd.set("transferId", transferId);
  return fd;
}

describe("scenario verification — Add Transfer", () => {
  it("A5: opening amount mismatched against original principal is rejected", async () => {
    const { testDb, fixedDeposits } = await freshFixture();
    await makeFd(fixedDeposits);
    const r = await createTransfer(
      {},
      transferFD({ destinationAccountId: "", destinationFixedDepositId: "fd-1", sourceAmount: "1000", destinationAmount: "1000", purpose: "fixed-deposit-opening" }),
      { db: testDb.db, redirectTo: () => {}, newId: () => "t-open-mismatch" }
    );
    expect(r.formError).toEqual({ key: "errors.databaseDetail", params: { detail: "Opening Transfer amount must match the Fixed Deposit original principal." } });
  });

  it("A4: a second opening Transfer for the same FD is rejected", async () => {
    const { testDb, fixedDeposits } = await freshFixture();
    await makeFd(fixedDeposits);
    const first = await createTransfer(
      {},
      transferFD({ destinationAccountId: "", destinationFixedDepositId: "fd-1", sourceAmount: "100000", destinationAmount: "100000", purpose: "fixed-deposit-opening" }),
      { db: testDb.db, redirectTo: () => {}, newId: () => "t-open-1" }
    );
    expect(first.formError).toBeUndefined();
    const second = await createTransfer(
      {},
      transferFD({ destinationAccountId: "", destinationFixedDepositId: "fd-1", sourceAmount: "100000", destinationAmount: "100000", purpose: "fixed-deposit-opening" }),
      { db: testDb.db, redirectTo: () => {}, newId: () => "t-open-2" }
    );
    expect(second.formError).toEqual({ key: "errors.databaseDetail", params: { detail: "A Fixed Deposit can only have one opening Transfer." } });
  });

  it("A6: withdrawal payout to an Account other than the linked one is rejected", async () => {
    const { testDb, fixedDeposits } = await freshFixture();
    await makeFd(fixedDeposits);
    const r = await createTransfer(
      {},
      transferFD({ sourceAccountId: "", sourceFixedDepositId: "fd-1", destinationAccountId: "acc-inr2", sourceAmount: "1000", destinationAmount: "1000", purpose: "fixed-deposit-withdrawal" }),
      { db: testDb.db, redirectTo: () => {}, newId: () => "t-wdr-wrong" }
    );
    expect(r.formError).toEqual({ key: "errors.databaseDetail", params: { detail: "A Fixed Deposit withdrawal must pay out to its linked Account." } });
  });

  it("A7: pre-maturity withdrawal exceeding current principal is rejected", async () => {
    const { testDb, fixedDeposits } = await freshFixture();
    await makeFd(fixedDeposits);
    const r = await createTransfer(
      {},
      transferFD({ sourceAccountId: "", sourceFixedDepositId: "fd-1", destinationAccountId: "acc-inr", sourceAmount: "200000", destinationAmount: "200000", occurredAt: "2026-06-01T09:00", purpose: "fixed-deposit-withdrawal" }),
      { db: testDb.db, redirectTo: () => {}, newId: () => "t-wdr-over" }
    );
    expect(r.formError).toEqual({ key: "errors.databaseDetail", params: { detail: "Withdrawal amount cannot exceed the Fixed Deposit current principal." } });
  });

  it("A8: post-maturity withdrawal exceeding principal is accepted by design, clamped to 0 (interest swallowed)", async () => {
    const { testDb, fixedDeposits } = await freshFixture();
    await makeFd(fixedDeposits);
    const r = await createTransfer(
      {},
      transferFD({ sourceAccountId: "", sourceFixedDepositId: "fd-1", destinationAccountId: "acc-inr", sourceAmount: "150000", destinationAmount: "150000", occurredAt: "2027-06-01T09:00", purpose: "fixed-deposit-withdrawal" }),
      { db: testDb.db, redirectTo: () => {}, newId: () => "t-wdr-post" }
    );
    expect(r.formError).toBeUndefined();
    const fd = await fixedDeposits.getById("fd-1");
    expect(fd?.principalMinor).toBe(0);
    expect(fd?.status).toBe("Matured");
  });

  it("A9: top-up into a non-Open (Matured) FixedDeposit is rejected", async () => {
    const { testDb, fixedDeposits } = await freshFixture();
    await makeFd(fixedDeposits);
    // Drive it to Matured via a legitimate full post-maturity withdrawal first.
    await createTransfer(
      {},
      transferFD({ sourceAccountId: "", sourceFixedDepositId: "fd-1", destinationAccountId: "acc-inr", sourceAmount: "100000", destinationAmount: "100000", occurredAt: "2027-06-01T09:00", purpose: "fixed-deposit-withdrawal" }),
      { db: testDb.db, redirectTo: () => {}, newId: () => "t-mature-it" }
    );
    expect((await fixedDeposits.getById("fd-1"))?.status).toBe("Matured");

    const r = await createTransfer(
      {},
      transferFD({ destinationAccountId: "", destinationFixedDepositId: "fd-1", sourceAmount: "500", destinationAmount: "500", purpose: "fixed-deposit-top-up" }),
      { db: testDb.db, redirectTo: () => {}, newId: () => "t-topup-matured" }
    );
    expect(r.formError).toEqual({ key: "errors.databaseDetail", params: { detail: "Only an Open Fixed Deposit can receive a Transfer." } });
  });
});

describe("scenario verification — Delete Transfer", () => {
  it("B10: deleting a non-existent Transfer id is a no-op, not a throw", async () => {
    const { testDb } = await freshFixture();
    await expect(deleteTransfer({}, deleteForm("does-not-exist"), { db: testDb.db, redirectTo: () => {} })).resolves.toEqual({});
  });

  it("B11: double-deleting the same Transfer is a harmless no-op", async () => {
    const { testDb } = await freshFixture();
    await createTransfer({}, transferFD({}), { db: testDb.db, redirectTo: () => {}, newId: () => "t-simple" });
    await deleteTransfer({}, deleteForm("t-simple"), { db: testDb.db, redirectTo: () => {} });
    await expect(deleteTransfer({}, deleteForm("t-simple"), { db: testDb.db, redirectTo: () => {} })).resolves.toEqual({});
  });

  it("B12: deleting a full-withdrawal Transfer reverts the FixedDeposit to Open at its prior principal", async () => {
    const { testDb, fixedDeposits } = await freshFixture();
    await makeFd(fixedDeposits);
    await createTransfer(
      {},
      transferFD({ sourceAccountId: "", sourceFixedDepositId: "fd-1", destinationAccountId: "acc-inr", sourceAmount: "100000", destinationAmount: "100000", occurredAt: "2026-06-01T09:00", purpose: "fixed-deposit-withdrawal" }),
      { db: testDb.db, redirectTo: () => {}, newId: () => "t-full-wdr" }
    );
    expect((await fixedDeposits.getById("fd-1"))?.status).toBe("PrematurelyClosed");

    await deleteTransfer({}, deleteForm("t-full-wdr"), { db: testDb.db, redirectTo: () => {} });
    const reverted = await fixedDeposits.getById("fd-1");
    expect(reverted?.status).toBe("Open");
    expect(reverted?.principalMinor).toBe(FD_PRINCIPAL_MINOR);
  });

  it("B13 (fixed): deleting a Transfer that makes the remaining date-ordered history replay negative now returns a friendly formError instead of throwing", async () => {
    const { testDb, fixedDeposits } = await freshFixture();
    await makeFd(fixedDeposits);
    // Top-up 50000 dated EARLY (2026-02-01): at creation time current principal 100000+50000=150000, fine.
    await createTransfer(
      {},
      transferFD({ destinationAccountId: "", destinationFixedDepositId: "fd-1", sourceAmount: "50000", destinationAmount: "50000", occurredAt: "2026-02-01T09:00", purpose: "fixed-deposit-top-up" }),
      { db: testDb.db, redirectTo: () => {}, newId: () => "t-early-topup" }
    );
    // Withdraw 140000 dated LATER (2026-06-01): current principal at creation time is 150000, so 140000 <= 150000, allowed.
    const wdr = await createTransfer(
      {},
      transferFD({ sourceAccountId: "", sourceFixedDepositId: "fd-1", destinationAccountId: "acc-inr", sourceAmount: "140000", destinationAmount: "140000", occurredAt: "2026-06-01T09:00", purpose: "fixed-deposit-withdrawal" }),
      { db: testDb.db, redirectTo: () => {}, newId: () => "t-late-wdr" }
    );
    expect(wdr.formError).toBeUndefined();

    // Deleting the early top-up leaves only the withdrawal(140000) against original principal(100000),
    // replayed in date order — this exceeds principal and the recompute throws internally.
    // FIXED: runDatabaseWrite no longer masks a typed domain error as a generic DatabaseError,
    // and deleteTransfer now catches FixedDepositTransferError and returns a friendly formError
    // instead of letting it crash the request.
    const result = await deleteTransfer({}, deleteForm("t-early-topup"), { db: testDb.db, redirectTo: () => {} });
    expect(result.formError).toEqual({ key: "errors.databaseDetail", params: { detail: "Fixed Deposit principal cannot become negative." } });
    // Nothing was left half-deleted — the transaction rolled back.
    const transfers = new TransferRepository(testDb.db);
    expect(await transfers.getById("t-early-topup")).not.toBeNull();
  });
});

describe("scenario verification — Duplicate Transfer / Transaction", () => {
  beforeEach(() => {
    resetIdempotencyKeysForTests();
  });

  it("C14 (before fix / no idempotencyKey supplied): two calls with byte-identical Transfer form data still both persist — matches real forms only when the hidden field is missing/stripped", async () => {
    const { testDb } = await freshFixture();
    await createTransfer({}, transferFD({ description: "Dup transfer" }), { db: testDb.db, redirectTo: () => {}, newId: () => "t-dup-1" });
    await createTransfer({}, transferFD({ description: "Dup transfer" }), { db: testDb.db, redirectTo: () => {}, newId: () => "t-dup-2" });
    const transfers = new TransferRepository(testDb.db);
    expect(await transfers.getById("t-dup-1")).not.toBeNull();
    expect(await transfers.getById("t-dup-2")).not.toBeNull();
  });

  it("C14 (fixed): two calls carrying the same idempotencyKey — the real form's double-submit/back-button-resubmit shape — are caught, only one persists", async () => {
    const { testDb } = await freshFixture();
    const transfers = new TransferRepository(testDb.db);
    const first = transferFD({ description: "Dup transfer" });
    first.set("idempotencyKey", "same-key");
    const firstResult = await createTransfer({}, first, { db: testDb.db, redirectTo: () => {}, newId: () => "t-dup-1" });
    expect(firstResult.formError).toBeUndefined();

    const second = transferFD({ description: "Dup transfer" });
    second.set("idempotencyKey", "same-key");
    const secondResult = await createTransfer({}, second, { db: testDb.db, redirectTo: () => {}, newId: () => "t-dup-2" });

    expect(secondResult.formError).toEqual({ key: "errors.transferDuplicateSubmission" });
    expect(await transfers.getById("t-dup-1")).not.toBeNull();
    expect(await transfers.getById("t-dup-2")).toBeNull();
  });

  it("C15 (before fix / no idempotencyKey supplied): two calls with byte-identical Transaction form data still both persist", async () => {
    const { testDb } = await freshFixture();
    function txnForm() {
      const fd = new FormData();
      fd.set("accountId", "acc-inr");
      fd.set("amount", "500.00");
      fd.set("kind", "Expense");
      fd.set("category", "Grocery");
      fd.set("occurredAt", "2026-09-05T09:30");
      fd.set("description", "Dup txn");
      return fd;
    }
    await createTransaction({}, txnForm(), { db: testDb.db, redirectTo: () => {}, newId: () => "txn-dup-1" });
    await createTransaction({}, txnForm(), { db: testDb.db, redirectTo: () => {}, newId: () => "txn-dup-2" });
    const transactions = new TransactionRepository(testDb.db);
    const dups = (await transactions.listByAccountId("acc-inr")).filter((t) => t.description === "Dup txn");
    expect(dups).toHaveLength(2);
  });

  it("C15 (fixed): two calls carrying the same idempotencyKey are caught, only one persists", async () => {
    const { testDb } = await freshFixture();
    function txnForm() {
      const fd = new FormData();
      fd.set("accountId", "acc-inr");
      fd.set("amount", "500.00");
      fd.set("kind", "Expense");
      fd.set("category", "Grocery");
      fd.set("occurredAt", "2026-09-05T09:30");
      fd.set("description", "Dup txn");
      fd.set("idempotencyKey", "same-key");
      return fd;
    }
    const firstResult = await createTransaction({}, txnForm(), { db: testDb.db, redirectTo: () => {}, newId: () => "txn-dup-1" });
    expect(firstResult.formError).toBeUndefined();
    const secondResult = await createTransaction({}, txnForm(), { db: testDb.db, redirectTo: () => {}, newId: () => "txn-dup-2" });
    expect(secondResult.formError).toEqual({ key: "errors.duplicateSubmission" });
    const transactions = new TransactionRepository(testDb.db);
    const dups = (await transactions.listByAccountId("acc-inr")).filter((t) => t.description === "Dup txn");
    expect(dups).toHaveLength(1);
  });
});

describe("scenario verification — Edit/Update Transfer", () => {
  it("D17: editing a partial withdrawal's amount upward, still within the original principal, is validated against a stale (already-decremented) current principal", async () => {
    const { testDb, fixedDeposits } = await freshFixture();
    await makeFd(fixedDeposits);
    await createTransfer(
      {},
      transferFD({ sourceAccountId: "", sourceFixedDepositId: "fd-1", destinationAccountId: "acc-inr", sourceAmount: "60000", destinationAmount: "60000", occurredAt: "2026-03-01T09:00", purpose: "fixed-deposit-withdrawal" }),
      { db: testDb.db, redirectTo: () => {}, newId: () => "t-partial-wdr" }
    );
    expect((await fixedDeposits.getById("fd-1"))?.principalMinor).toBe(4_000_000);

    const editForm = new FormData();
    editForm.set("transferId", "t-partial-wdr");
    editForm.set("sourceAccountId", "");
    editForm.set("sourceFixedDepositId", "fd-1");
    editForm.set("sourceAmount", "90000");
    editForm.set("sourceCurrencyCode", "INR");
    editForm.set("destinationAccountId", "acc-inr");
    editForm.set("destinationFixedDepositId", "");
    editForm.set("destinationAmount", "90000");
    editForm.set("destinationCurrencyCode", "INR");
    editForm.set("occurredAt", "2026-03-01T09:00");
    editForm.set("description", "Increased withdrawal");
    editForm.set("purpose", "fixed-deposit-withdrawal");

    const result = await updateTransfer({}, editForm, { db: testDb.db, redirectTo: () => {} });
    // FIXED: validateTransferInvariants now adds back this same Transfer's old withdrawal
    // amount before checking the new one against principal, so 90000 <= original 100000 is
    // correctly accepted instead of being compared against the stale, already-decremented
    // current principal (40000).
    expect(result.formError).toBeUndefined();
    expect((await fixedDeposits.getById("fd-1"))?.principalMinor).toBe(1_000_000);
  });

  it("D18 (fixed): editing only the description of a withdrawal Transfer that fully closed its own FD now succeeds, matching the Edit Transfer link the detail page offers", async () => {
    const { testDb, fixedDeposits } = await freshFixture();
    await makeFd(fixedDeposits);
    await createTransfer(
      {},
      transferFD({ sourceAccountId: "", sourceFixedDepositId: "fd-1", destinationAccountId: "acc-inr", sourceAmount: "100000", destinationAmount: "100000", occurredAt: "2026-06-01T09:00", purpose: "fixed-deposit-withdrawal" }),
      { db: testDb.db, redirectTo: () => {}, newId: () => "t-close-wdr" }
    );
    expect((await fixedDeposits.getById("fd-1"))?.status).toBe("PrematurelyClosed");

    const editForm = new FormData();
    editForm.set("transferId", "t-close-wdr");
    editForm.set("sourceAccountId", "");
    editForm.set("sourceFixedDepositId", "fd-1");
    editForm.set("sourceAmount", "100000");
    editForm.set("sourceCurrencyCode", "INR");
    editForm.set("destinationAccountId", "acc-inr");
    editForm.set("destinationFixedDepositId", "");
    editForm.set("destinationAmount", "100000");
    editForm.set("destinationCurrencyCode", "INR");
    editForm.set("occurredAt", "2026-06-01T09:00");
    editForm.set("description", "just fixing a typo");
    editForm.set("purpose", "fixed-deposit-withdrawal");

    const result = await updateTransfer({}, editForm, { db: testDb.db, redirectTo: () => {} });
    // FIXED: editing the very Transfer that closed this FD no longer fails the "must be Open"
    // check, so a same-amount edit (fixing the description) succeeds.
    expect(result.formError).toBeUndefined();
    const fd = await fixedDeposits.getById("fd-1");
    expect(fd?.principalMinor).toBe(0);
    expect(fd?.status).toBe("PrematurelyClosed");
    const transfers = new TransferRepository(testDb.db);
    expect((await transfers.getById("t-close-wdr"))?.description).toBe("just fixing a typo");
  });

  it("D20: retargeting an Account-to-Account Transfer's destination to a FixedDeposit re-infers purpose=fixed-deposit-top-up and applies principal", async () => {
    const { testDb, fixedDeposits } = await freshFixture();
    await makeFd(fixedDeposits);
    await createTransfer({}, transferFD({ description: "Original account-to-account" }), { db: testDb.db, redirectTo: () => {}, newId: () => "t-retarget" });

    const editForm = new FormData();
    editForm.set("transferId", "t-retarget");
    editForm.set("sourceAccountId", "acc-inr");
    editForm.set("sourceFixedDepositId", "");
    editForm.set("sourceAmount", "5000");
    editForm.set("sourceCurrencyCode", "INR");
    editForm.set("destinationAccountId", "");
    editForm.set("destinationFixedDepositId", "fd-1");
    editForm.set("destinationAmount", "5000");
    editForm.set("destinationCurrencyCode", "INR");
    editForm.set("occurredAt", "2026-09-05T09:30");
    editForm.set("description", "retargeted to FD top-up");
    editForm.set("purpose", "");

    const result = await updateTransfer({}, editForm, { db: testDb.db, redirectTo: () => {} });
    expect(result.formError).toBeUndefined();
    const transfers = new TransferRepository(testDb.db);
    const updated = await transfers.getById("t-retarget");
    expect(updated?.purpose).toBe("fixed-deposit-top-up");
    expect((await fixedDeposits.getById("fd-1"))?.principalMinor).toBe(FD_PRINCIPAL_MINOR + 500_000);
  });
});

describe("scenario verification — zero-decimal currency (JPY) end-to-end", () => {
  it("accepts a whole-number JPY amount as-is (no x100 scaling) and rejects a fractional one", async () => {
    const testDb = createTestDb();
    await new InstitutionRepository(testDb.db).create({ id: "inst-jpy", name: "JPY Bank" });
    await new AccountRepository(testDb.db).create({
      id: "acc-jpy",
      institutionId: "inst-jpy",
      name: "JPY Account",
      accountNumber: null,
      currencyCode: "JPY"
    });

    const wholeForm = new FormData();
    wholeForm.set("accountId", "acc-jpy");
    wholeForm.set("amount", "1234");
    wholeForm.set("kind", "Income");
    wholeForm.set("category", "Salary");
    wholeForm.set("occurredAt", "2026-09-05T09:30");
    wholeForm.set("description", "JPY salary");
    const wholeResult = await createTransaction({}, wholeForm, {
      db: testDb.db,
      redirectTo: () => {},
      newId: () => "txn-jpy-whole"
    });
    expect(wholeResult.formError).toBeUndefined();
    expect(wholeResult.fieldErrors).toBeUndefined();

    const transactions = new TransactionRepository(testDb.db);
    const txn = await transactions.getById("txn-jpy-whole");
    // JPY has 0 minor units — "1234" must store as 1234, not 123400.
    expect(txn?.amountMinor).toBe(1234);

    const fractionalForm = new FormData();
    fractionalForm.set("accountId", "acc-jpy");
    fractionalForm.set("amount", "12.34");
    fractionalForm.set("kind", "Income");
    fractionalForm.set("category", "Salary");
    fractionalForm.set("occurredAt", "2026-09-05T09:30");
    fractionalForm.set("description", "Invalid fractional JPY");
    const fractionalResult = await createTransaction({}, fractionalForm, {
      db: testDb.db,
      redirectTo: () => {},
      newId: () => "txn-jpy-fraction"
    });
    expect(fractionalResult.fieldErrors?.amount).toEqual({ key: "errors.amountInvalid" });
  });
});
