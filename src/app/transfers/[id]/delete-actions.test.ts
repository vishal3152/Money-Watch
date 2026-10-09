import { randomUUID } from "node:crypto";

import postgres from "postgres";
import { describe, expect, it, vi } from "vitest";

import { deleteTransfer } from "@/app/transfers/[id]/delete-actions";
import { PgAccountRepository } from "@/db/postgres/repositories/account-repository";
import { PgInstitutionRepository } from "@/db/postgres/repositories/institution-repository";
import { PgTransferRepository } from "@/db/postgres/repositories/transfer-repository";
import { AccountRepository } from "@/db/repositories/account-repository";
import { FixedDepositRepository } from "@/db/repositories/fixed-deposit-repository";
import { InstitutionRepository } from "@/db/repositories/institution-repository";
import { createTestDb } from "@/db/repositories/test-db";
import { TransferRepository } from "@/db/repositories/transfer-repository";

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

function formDataWithTransferId(transferId: string): FormData {
  const data = new FormData();
  data.set("transferId", transferId);
  return data;
}

describe("deleteTransfer", () => {
  it("deletes a Transfer and its linked Transactions, then redirects home", async () => {
    const testDb = createTestDb();
    await new InstitutionRepository(testDb.db).create({ id: "inst-1", name: "Bank One" });
    const accounts = new AccountRepository(testDb.db);
    await accounts.create({
      id: "acc-usd",
      institutionId: "inst-1",
      name: "USD Checking",
      accountNumber: null,
      currencyCode: "USD"
    });
    await accounts.create({
      id: "acc-inr",
      institutionId: "inst-1",
      name: "INR Savings",
      accountNumber: null,
      currencyCode: "INR"
    });
    const transfers = new TransferRepository(testDb.db);
    await transfers.create({
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
    const redirectTo = vi.fn();

    const result = await deleteTransfer({}, formDataWithTransferId("transfer-1"), {
      db: testDb.db,
      redirectTo
    });

    expect(result).toEqual({});
    expect(await transfers.getById("transfer-1")).toBeNull();
    expect(redirectTo).toHaveBeenCalledWith("/?message=transfer_deleted");
  });

  it("returns a friendly form error, instead of throwing, when deleting would replay the Fixed Deposit's remaining history negative", async () => {
    const testDb = createTestDb();
    await new InstitutionRepository(testDb.db).create({ id: "inst-1", name: "Bank One" });
    const accounts = new AccountRepository(testDb.db);
    await accounts.create({
      id: "acc-inr",
      institutionId: "inst-1",
      name: "INR Savings",
      accountNumber: null,
      currencyCode: "INR"
    });
    await accounts.create({
      id: "acc-inr2",
      institutionId: "inst-1",
      name: "INR Savings 2",
      accountNumber: null,
      currencyCode: "INR"
    });
    await new FixedDepositRepository(testDb.db).create({
      id: "fd-1",
      name: "FD1",
      accountNumber: null,
      institutionId: "inst-1",
      linkedAccountId: "acc-inr",
      principalMinor: 10_000_000,
      originalPrincipalMinor: 10_000_000,
      currencyCode: "INR",
      interestRateBps: 650,
      openedDate: "2026-01-01",
      maturityDate: "2027-01-01",
      status: "Open"
    });
    const transfers = new TransferRepository(testDb.db);
    // Early top-up (2026-02-01): current principal 10,000,000 -> 15,000,000, fine.
    await transfers.create({
      id: "t-early-topup",
      sourceAccountId: "acc-inr2",
      sourceFixedDepositId: null,
      sourceAmountMinor: 5_000_000,
      sourceCurrencyCode: "INR",
      destinationAccountId: null,
      destinationFixedDepositId: "fd-1",
      destinationAmountMinor: 5_000_000,
      destinationCurrencyCode: "INR",
      occurredAt: "2026-02-01T09:00:00.000Z",
      description: "Early top-up",
      purpose: "fixed-deposit-top-up"
    });
    // Later withdrawal (2026-06-01) of 14,000,000: current principal 15,000,000, so allowed at create time.
    await transfers.create({
      id: "t-late-wdr",
      sourceAccountId: null,
      sourceFixedDepositId: "fd-1",
      sourceAmountMinor: 14_000_000,
      sourceCurrencyCode: "INR",
      destinationAccountId: "acc-inr",
      destinationFixedDepositId: null,
      destinationAmountMinor: 14_000_000,
      destinationCurrencyCode: "INR",
      occurredAt: "2026-06-01T09:00:00.000Z",
      description: "Later withdrawal",
      purpose: "fixed-deposit-withdrawal"
    });

    // Deleting the early top-up leaves only the 14,000,000 withdrawal replayed against the
    // original 10,000,000 principal — this goes negative, and used to surface as an uncaught
    // DatabaseError instead of a friendly form error.
    const result = await deleteTransfer({}, formDataWithTransferId("t-early-topup"), {
      db: testDb.db,
      redirectTo: vi.fn()
    });

    expect(result.formError).toEqual({ key: "errors.databaseDetail", params: { detail: "Fixed Deposit principal cannot become negative." } });
    // Nothing was left half-deleted: the top-up Transfer must still exist.
    expect(await transfers.getById("t-early-topup")).not.toBeNull();
  });

  it("deletes from the Postgres repository, scoped to the owner, when an owner is resolved", async () => {
    const ownerId = randomUUID();
    const institution = { id: randomUUID(), name: "Cloud Bank" };
    const accountA = {
      id: randomUUID(),
      institutionId: institution.id,
      name: "USD Checking",
      accountNumber: null,
      currencyCode: "USD"
    };
    const accountB = {
      id: randomUUID(),
      institutionId: institution.id,
      name: "INR Savings",
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
      sourceAmountMinor: 100_000,
      sourceCurrencyCode: "USD",
      destinationAccountId: accountB.id,
      destinationFixedDepositId: null,
      destinationAmountMinor: 8_300_000,
      destinationCurrencyCode: "INR",
      occurredAt: "2026-01-01T00:00:00.000Z",
      description: "USD to INR transfer",
      purpose: "general"
    });
    const redirectTo = vi.fn();

    try {
      const result = await deleteTransfer({}, formDataWithTransferId(transferId), {
        getCurrentOwnerId: async () => ownerId,
        isCloudMode: () => true,
        postgresConnectionString: TEST_DATABASE_URL,
        redirectTo
      });

      expect(result).toEqual({});
      expect(await pgTransfers.getById(transferId)).toBeNull();
      expect(redirectTo).toHaveBeenCalledWith("/?message=transfer_deleted");
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
