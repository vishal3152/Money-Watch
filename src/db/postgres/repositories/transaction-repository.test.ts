import { randomUUID } from "node:crypto";

import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";

import { computeAccountBalance } from "@/domain/account-balance";
import { PgAccountRepository } from "@/db/postgres/repositories/account-repository";
import { PgBalanceSnapshotRepository } from "@/db/postgres/repositories/balance-snapshot-repository";
import { PgInstitutionRepository } from "@/db/postgres/repositories/institution-repository";
import { PgReconciliationRepository } from "@/db/postgres/repositories/reconciliation-repository";
import { PgTransactionRepository } from "@/db/postgres/repositories/transaction-repository";
import { PgTransferRepository } from "@/db/postgres/repositories/transfer-repository";
import { TransactionNotEditableError, TransactionNotFoundError } from "@/db/errors";

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

describe("PgTransactionRepository", () => {
  it("persists transferId on create and returns it from listByAccountId", async () => {
    const ownerId = randomUUID();
    const { institution, account } = await seedOwnerWithAccount(ownerId);
    const transferId = randomUUID();
    const transactionId = randomUUID();

    try {
      await admin`
        insert into transfers (
          id, owner_id, source_account_id, source_fixed_deposit_id,
          source_amount_minor, source_currency_code,
          destination_account_id, destination_fixed_deposit_id,
          destination_amount_minor, destination_currency_code,
          occurred_at, description, purpose
        ) values (
          ${transferId}, ${ownerId}::uuid, ${account.id}, null,
          1000, 'USD',
          null, null,
          1000, 'USD',
          '2026-01-01T00:00:00.000Z', 'Fixture transfer', 'general'
        )
      `;

      const repo = new PgTransactionRepository(CONNECTION_STRING, ownerId);
      await repo.create({
        id: transactionId,
        accountId: account.id,
        amountMinor: -1000,
        occurredAt: "2026-01-01T00:00:00.000Z",
        description: "Linked leg",
        trustStatus: "Confirmed",
        transferId,
        category: null,
        importBatchId: null
      });

      expect(await repo.listByAccountId(account.id)).toEqual([
        expect.objectContaining({ id: transactionId, transferId, amountMinor: -1000 })
      ]);
    } finally {
      await admin`delete from transactions where id = ${transactionId}`;
      await admin`delete from transfers where id = ${transferId}`;
      await admin`delete from accounts where id = ${account.id}`;
      await admin`delete from institutions where id = ${institution.id}`;
    }
  });

  it("listByAccountId() only returns Transactions belonging to the scoped Owner's Account", async () => {
    const ownerA = randomUUID();
    const ownerB = randomUUID();
    const { institution: institutionA, account: accountA } = await seedOwnerWithAccount(ownerA);
    const { institution: institutionB, account: accountB } = await seedOwnerWithAccount(ownerB);

    const transactionA = {
      id: randomUUID(),
      accountId: accountA.id,
      amountMinor: 5000,
      occurredAt: "2026-01-01T00:00:00.000Z",
      description: "Owner A deposit",
      trustStatus: "Confirmed" as const,
      transferId: null,
      category: null,
      importBatchId: null,
      externalRef: null,
      possibleDuplicateOfTransactionId: null
    };
    const transactionB = { ...transactionA, id: randomUUID(), accountId: accountB.id, description: "Owner B deposit" };

    try {
      const repoA = new PgTransactionRepository(CONNECTION_STRING, ownerA);
      const repoB = new PgTransactionRepository(CONNECTION_STRING, ownerB);
      await repoA.create(transactionA);
      await repoB.create(transactionB);

      const ownerATransactions = await repoA.listByAccountId(accountA.id);

      expect(ownerATransactions).toEqual([transactionA]);
      expect(computeAccountBalance(ownerATransactions)).toBe(5000);
    } finally {
      await admin`delete from transactions where id in (${transactionA.id}, ${transactionB.id})`;
      await admin`delete from accounts where id in (${accountA.id}, ${accountB.id})`;
      await admin`delete from institutions where id in (${institutionA.id}, ${institutionB.id})`;
    }
  });

  it("getById() returns a single Transaction scoped to the calling Owner and null for another Owner's or an unknown id", async () => {
    const ownerA = randomUUID();
    const ownerB = randomUUID();
    const { account: accountA } = await seedOwnerWithAccount(ownerA);

    const repoA = new PgTransactionRepository(CONNECTION_STRING, ownerA);
    const repoB = new PgTransactionRepository(CONNECTION_STRING, ownerB);
    const transactionA = {
      id: randomUUID(),
      accountId: accountA.id,
      amountMinor: 750,
      occurredAt: "2026-01-01T00:00:00.000Z",
      description: "Owner A adjustment",
      trustStatus: "Confirmed" as const,
      transferId: null,
      category: null,
      importBatchId: null,
      externalRef: null,
      possibleDuplicateOfTransactionId: null
    };

    try {
      await repoA.create(transactionA);

      expect(await repoA.getById(transactionA.id)).toEqual(transactionA);
      expect(await repoB.getById(transactionA.id)).toBeNull();
      expect(await repoA.getById(randomUUID())).toBeNull();
    } finally {
      await admin`delete from transactions where id = ${transactionA.id}`;
    }
  });

  it("sumAmountsByAccountIds() sums per-Account in one query and stays scoped to the calling Owner", async () => {
    const ownerA = randomUUID();
    const ownerB = randomUUID();
    const { institution: institutionA, account: accountA1 } = await seedOwnerWithAccount(ownerA);
    const accountA2 = {
      id: randomUUID(),
      institutionId: institutionA.id,
      name: "Savings",
      accountNumber: null,
      currencyCode: "USD"
    };
    const { institution: institutionB, account: accountB } = await seedOwnerWithAccount(ownerB);

    const repoA = new PgTransactionRepository(CONNECTION_STRING, ownerA);
    const repoB = new PgTransactionRepository(CONNECTION_STRING, ownerB);
    const transactionA1 = {
      id: randomUUID(),
      accountId: accountA1.id,
      amountMinor: 5000,
      occurredAt: "2026-01-01T00:00:00.000Z",
      description: "Owner A deposit",
      trustStatus: "Confirmed" as const,
      transferId: null,
      category: null,
      importBatchId: null
    };
    const transactionA1b = { ...transactionA1, id: randomUUID(), amountMinor: -1000 };
    const transactionA2 = { ...transactionA1, id: randomUUID(), accountId: accountA2.id, amountMinor: 200 };
    const transactionB = { ...transactionA1, id: randomUUID(), accountId: accountB.id, amountMinor: 999_999 };

    try {
      await new PgAccountRepository(CONNECTION_STRING, ownerA).create(accountA2);
      await repoA.create(transactionA1);
      await repoA.create(transactionA1b);
      await repoA.create(transactionA2);
      await repoB.create(transactionB);

      const totals = await repoA.sumAmountsByAccountIds([accountA1.id, accountA2.id, accountB.id]);

      expect(totals.sort((a, b) => a.accountId.localeCompare(b.accountId))).toEqual(
        [
          { accountId: accountA1.id, balanceMinor: 4000 },
          { accountId: accountA2.id, balanceMinor: 200 }
        ].sort((a, b) => a.accountId.localeCompare(b.accountId))
      );
      expect(await repoA.sumAmountsByAccountIds([])).toEqual([]);
    } finally {
      await admin`delete from transactions where id in (${transactionA1.id}, ${transactionA1b.id}, ${transactionA2.id}, ${transactionB.id})`;
      await admin`delete from accounts where id in (${accountA1.id}, ${accountA2.id}, ${accountB.id})`;
      await admin`delete from institutions where id in (${institutionA.id}, ${institutionB.id})`;
    }
  });

  describe("update", () => {
    it("updates a manually-entered Confirmed Transaction scoped to the calling Owner", async () => {
      const ownerId = randomUUID();
      const { institution, account } = await seedOwnerWithAccount(ownerId);
      const repo = new PgTransactionRepository(CONNECTION_STRING, ownerId);
      const transactionId = randomUUID();

      try {
        await repo.create({
          id: transactionId,
          accountId: account.id,
          amountMinor: -150_000,
          occurredAt: "2026-01-15T00:00:00.000Z",
          description: "Grocery run",
          trustStatus: "Confirmed",
          transferId: null,
          category: "Grocery",
          importBatchId: null
        });

        const updated = await repo.update(transactionId, {
          amountMinor: -160_000,
          description: "Grocery run (corrected)",
          category: "Dining",
          occurredAt: "2026-01-16T00:00:00.000Z"
        });

        expect(updated).toEqual({
          id: transactionId,
          accountId: account.id,
          amountMinor: -160_000,
          occurredAt: "2026-01-16T00:00:00.000Z",
          description: "Grocery run (corrected)",
          trustStatus: "Confirmed",
          transferId: null,
          category: "Dining",
          importBatchId: null,
          externalRef: null,
          possibleDuplicateOfTransactionId: null
        });
      } finally {
        await admin`delete from transactions where id = ${transactionId}`;
        await admin`delete from accounts where id = ${account.id}`;
        await admin`delete from institutions where id = ${institution.id}`;
      }
    });

    it("rejects updating a Transfer-linked Transaction", async () => {
      const ownerId = randomUUID();
      const { institution, account } = await seedOwnerWithAccount(ownerId);
      const account2 = {
        id: randomUUID(),
        institutionId: institution.id,
        name: "Savings",
        accountNumber: null,
        currencyCode: "USD"
      };
      const transferId = randomUUID();

      try {
        await new PgAccountRepository(CONNECTION_STRING, ownerId).create(account2);
        await new PgTransferRepository(CONNECTION_STRING, ownerId).create({
          id: transferId,
          sourceAccountId: account.id,
          sourceFixedDepositId: null,
          sourceAmountMinor: 1000,
          sourceCurrencyCode: "USD",
          destinationAccountId: account2.id,
          destinationFixedDepositId: null,
          destinationAmountMinor: 1000,
          destinationCurrencyCode: "USD",
          occurredAt: "2026-01-15T00:00:00.000Z",
          description: "Transfer leg",
          purpose: "general"
        });

        const repo = new PgTransactionRepository(CONNECTION_STRING, ownerId);
        await expect(
          repo.update(`${transferId}-source`, { description: "Changed" })
        ).rejects.toBeInstanceOf(TransactionNotEditableError);

        const sourceLeg = await repo.getById(`${transferId}-source`);
        expect(sourceLeg?.description).toBe("Transfer leg");
      } finally {
        await admin`delete from transactions where transfer_id = ${transferId}`;
        await admin`delete from transfers where id = ${transferId}`;
        await admin`delete from accounts where id in (${account.id}, ${account2.id})`;
        await admin`delete from institutions where id = ${institution.id}`;
      }
    });

    it("rejects updating an Adjustment Transaction", async () => {
      const ownerId = randomUUID();
      const { institution, account } = await seedOwnerWithAccount(ownerId);
      const baseTransactionId = randomUUID();
      const snapshotId = randomUUID();
      const reconciliationId = randomUUID();
      const adjustmentTransactionId = randomUUID();

      try {
        const repo = new PgTransactionRepository(CONNECTION_STRING, ownerId);
        await repo.create({
          id: baseTransactionId,
          accountId: account.id,
          amountMinor: 100_000,
          occurredAt: "2026-01-10T00:00:00.000Z",
          description: "Deposit",
          trustStatus: "Confirmed",
          transferId: null,
          category: "Salary",
          importBatchId: null
        });
        await new PgBalanceSnapshotRepository(CONNECTION_STRING, ownerId).create({
          id: snapshotId,
          accountId: account.id,
          asOfDate: "2026-01-31",
          balanceMinor: 105_000
        });
        const reconciliations = new PgReconciliationRepository(CONNECTION_STRING, ownerId);
        await reconciliations.create({
          id: reconciliationId,
          accountId: account.id,
          balanceSnapshotId: snapshotId,
          reconciledAt: "2026-02-01T00:00:00.000Z"
        });
        const discrepancy = await reconciliations.getDiscrepancyByReconciliationId(reconciliationId);
        await reconciliations.resolveWithAdjustment(discrepancy!.id, {
          id: adjustmentTransactionId,
          accountId: account.id,
          amountMinor: 5000,
          occurredAt: "2026-02-01T00:00:00.000Z",
          description: "Owner correction"
        });

        await expect(
          repo.update(adjustmentTransactionId, { description: "Changed" })
        ).rejects.toBeInstanceOf(TransactionNotEditableError);
      } finally {
        await admin`delete from adjustments where transaction_id = ${adjustmentTransactionId}`;
        await admin`delete from transactions where id in (${baseTransactionId}, ${adjustmentTransactionId})`;
        await admin`delete from discrepancies where reconciliation_id = ${reconciliationId}`;
        await admin`delete from reconciliations where id = ${reconciliationId}`;
        await admin`delete from balance_snapshots where id = ${snapshotId}`;
        await admin`delete from accounts where id = ${account.id}`;
        await admin`delete from institutions where id = ${institution.id}`;
      }
    });

    it("throws on an unknown transaction id", async () => {
      const ownerId = randomUUID();
      const repo = new PgTransactionRepository(CONNECTION_STRING, ownerId);

      await expect(repo.update(randomUUID(), { description: "Changed" })).rejects.toBeInstanceOf(
        TransactionNotFoundError
      );
    });

    it("does not update another Owner's Transaction", async () => {
      const ownerA = randomUUID();
      const ownerB = randomUUID();
      const { institution, account } = await seedOwnerWithAccount(ownerA);
      const repoA = new PgTransactionRepository(CONNECTION_STRING, ownerA);
      const repoB = new PgTransactionRepository(CONNECTION_STRING, ownerB);
      const transactionId = randomUUID();

      try {
        await repoA.create({
          id: transactionId,
          accountId: account.id,
          amountMinor: 500,
          occurredAt: "2026-01-01T00:00:00.000Z",
          description: "Owner A entry",
          trustStatus: "Confirmed",
          transferId: null,
          category: null,
          importBatchId: null
        });

        await expect(
          repoB.update(transactionId, { description: "Changed by B" })
        ).rejects.toBeInstanceOf(TransactionNotFoundError);

        expect((await repoA.getById(transactionId))?.description).toBe("Owner A entry");
      } finally {
        await admin`delete from transactions where id = ${transactionId}`;
        await admin`delete from accounts where id = ${account.id}`;
        await admin`delete from institutions where id = ${institution.id}`;
      }
    });
  });

  describe("delete", () => {
    it("deletes a manually-entered Confirmed Transaction", async () => {
      const ownerId = randomUUID();
      const { institution, account } = await seedOwnerWithAccount(ownerId);
      const repo = new PgTransactionRepository(CONNECTION_STRING, ownerId);
      const transactionId = randomUUID();

      try {
        await repo.create({
          id: transactionId,
          accountId: account.id,
          amountMinor: -150_000,
          occurredAt: "2026-01-15T00:00:00.000Z",
          description: "Grocery run",
          trustStatus: "Confirmed",
          transferId: null,
          category: "Grocery",
          importBatchId: null
        });

        await repo.delete(transactionId);

        expect(await repo.getById(transactionId)).toBeNull();
      } finally {
        await admin`delete from transactions where id = ${transactionId}`;
        await admin`delete from accounts where id = ${account.id}`;
        await admin`delete from institutions where id = ${institution.id}`;
      }
    });

    it("no-ops for an unknown transaction id", async () => {
      const ownerId = randomUUID();
      const repo = new PgTransactionRepository(CONNECTION_STRING, ownerId);

      await expect(repo.delete(randomUUID())).resolves.toBeUndefined();
    });

    // Deliberately verifies isolation catches a missing ownerId predicate: this
    // reproduces the highest-risk pattern flagged in CODEMAP.md (an update/delete
    // missing the Owner filter silently no-ops on another Owner's row instead of
    // throwing) for delete() specifically.
    it("does not delete another Owner's Transaction", async () => {
      const ownerA = randomUUID();
      const ownerB = randomUUID();
      const { institution, account } = await seedOwnerWithAccount(ownerA);
      const repoA = new PgTransactionRepository(CONNECTION_STRING, ownerA);
      const repoB = new PgTransactionRepository(CONNECTION_STRING, ownerB);
      const transactionId = randomUUID();

      try {
        await repoA.create({
          id: transactionId,
          accountId: account.id,
          amountMinor: 500,
          occurredAt: "2026-01-01T00:00:00.000Z",
          description: "Owner A entry",
          trustStatus: "Confirmed",
          transferId: null,
          category: null,
          importBatchId: null
        });

        await repoB.delete(transactionId);

        expect(await repoA.getById(transactionId)).not.toBeNull();
      } finally {
        await admin`delete from transactions where id = ${transactionId}`;
        await admin`delete from accounts where id = ${account.id}`;
        await admin`delete from institutions where id = ${institution.id}`;
      }
    });
  });

  describe("listPageByAccountId / listMonthsByAccountId", () => {
    async function seedLedger(ownerId: string, accountId: string, prefix: string) {
      const repository = new PgTransactionRepository(CONNECTION_STRING, ownerId);
      const ids: string[] = [];
      const rows = [
        { occurredAt: "2026-01-05T00:00:00.000Z", description: `${prefix} Groceries` },
        { occurredAt: "2026-01-20T00:00:00.000Z", description: `${prefix} Rent` },
        { occurredAt: "2026-02-05T00:00:00.000Z", description: `${prefix} GROCERIES weekly` },
        { occurredAt: "2026-03-05T00:00:00.000Z", description: `${prefix} Fuel 50% off` }
      ];
      for (const row of rows) {
        const id = randomUUID();
        ids.push(id);
        await repository.create({
          id,
          accountId,
          amountMinor: -1_000,
          occurredAt: row.occurredAt,
          description: row.description,
          trustStatus: "Confirmed",
          transferId: null,
          category: null,
          importBatchId: null
        });
      }
      return { repository, ids };
    }

    it("pages, filters, and counts within the calling Owner's Account only", async () => {
      const ownerA = randomUUID();
      const ownerB = randomUUID();
      const { institution: institutionA, account: accountA } = await seedOwnerWithAccount(ownerA);
      const { institution: institutionB, account: accountB } = await seedOwnerWithAccount(ownerB);

      let idsA: string[] = [];
      try {
        const seededA = await seedLedger(ownerA, accountA.id, "A");
        // Owner B's ledger exists only to be excluded from every assertion below.
        await seedLedger(ownerB, accountB.id, "B");
        idsA = seededA.ids;
        const repoA = seededA.repository;

        const first = await repoA.listPageByAccountId(accountA.id, { limit: 2, offset: 0 });
        expect(first.rows.map((row) => row.id)).toEqual(idsA.slice(0, 2));
        expect(first.total).toBe(4);

        const past = await repoA.listPageByAccountId(accountA.id, { limit: 2, offset: 10 });
        expect(past).toEqual({ rows: [], total: 4 });

        const searched = await repoA.listPageByAccountId(accountA.id, {
          limit: 10,
          offset: 0,
          search: "groceries"
        });
        expect(searched.rows.map((row) => row.id)).toEqual([idsA[0], idsA[2]]);
        expect(searched.total).toBe(2);

        // "%" must match literally, not as a LIKE wildcard.
        const wildcard = await repoA.listPageByAccountId(accountA.id, {
          limit: 10,
          offset: 0,
          search: "50%"
        });
        expect(wildcard.rows.map((row) => row.id)).toEqual([idsA[3]]);

        const byMonth = await repoA.listPageByAccountId(accountA.id, {
          limit: 10,
          offset: 0,
          month: "2026-01"
        });
        expect(byMonth.rows.map((row) => row.id)).toEqual(idsA.slice(0, 2));
        expect(byMonth.total).toBe(2);

        expect(await repoA.listMonthsByAccountId(accountA.id)).toEqual([
          "2026-03",
          "2026-02",
          "2026-01"
        ]);

        // Owner B's accountId is a real row; only the owner predicate excludes it.
        expect(await repoA.listPageByAccountId(accountB.id, { limit: 10, offset: 0 })).toEqual({
          rows: [],
          total: 0
        });
        expect(await repoA.listMonthsByAccountId(accountB.id)).toEqual([]);
      } finally {
        await admin`delete from transactions where account_id in (${accountA.id}, ${accountB.id})`;
        await admin`delete from accounts where id in (${accountA.id}, ${accountB.id})`;
        await admin`delete from institutions where id in (${institutionA.id}, ${institutionB.id})`;
      }
    });
  });

  describe("countByAccountId", () => {
    it("counts an owned Account's Transactions without leaking another Owner's rows for the same id", async () => {
      const ownerA = randomUUID();
      const ownerB = randomUUID();
      const { institution: institutionA, account: accountA } = await seedOwnerWithAccount(ownerA);
      const { institution: institutionB, account: accountB } = await seedOwnerWithAccount(ownerB);
      const transactionAId = randomUUID();
      const transactionBId = randomUUID();

      try {
        await new PgTransactionRepository(CONNECTION_STRING, ownerA).create({
          id: transactionAId,
          accountId: accountA.id,
          amountMinor: 1_000,
          occurredAt: "2026-01-01T00:00:00.000Z",
          description: "Owner A Deposit",
          trustStatus: "Confirmed",
          transferId: null,
          category: null,
          importBatchId: null
        });
        await new PgTransactionRepository(CONNECTION_STRING, ownerB).create({
          id: transactionBId,
          accountId: accountB.id,
          amountMinor: 2_000,
          occurredAt: "2026-01-01T00:00:00.000Z",
          description: "Owner B Deposit",
          trustStatus: "Confirmed",
          transferId: null,
          category: null,
          importBatchId: null
        });

        const repoA = new PgTransactionRepository(CONNECTION_STRING, ownerA);

        expect(await repoA.countByAccountId(accountA.id)).toBe(1);
        // accountB.id is a real Account row; only the owner predicate keeps this at 0.
        expect(await repoA.countByAccountId(accountB.id)).toBe(0);
      } finally {
        await admin`delete from transactions where id in (${transactionAId}, ${transactionBId})`;
        await admin`delete from accounts where id in (${accountA.id}, ${accountB.id})`;
        await admin`delete from institutions where id in (${institutionA.id}, ${institutionB.id})`;
      }
    });
  });

  describe("dismissSuspectedDuplicate", () => {
    it("clears possibleDuplicateOfTransactionId without changing any other field", async () => {
      const ownerId = randomUUID();
      const { institution, account } = await seedOwnerWithAccount(ownerId);
      const repository = new PgTransactionRepository(CONNECTION_STRING, ownerId);
      const originalId = randomUUID();
      const flaggedId = randomUUID();

      try {
        await repository.create({
          id: originalId,
          accountId: account.id,
          amountMinor: -15_00,
          occurredAt: "2026-01-15T00:00:00.000Z",
          description: "Grocery run",
          trustStatus: "Confirmed",
          transferId: null,
          category: "Grocery",
          importBatchId: null
        });
        await repository.create({
          id: flaggedId,
          accountId: account.id,
          amountMinor: -15_00,
          occurredAt: "2026-01-15T00:00:00.000Z",
          description: "Grocery run [REF123]",
          trustStatus: "Imported",
          transferId: null,
          category: "Grocery",
          importBatchId: null,
          possibleDuplicateOfTransactionId: originalId
        });

        const dismissed = await repository.dismissSuspectedDuplicate(flaggedId);

        expect(dismissed.possibleDuplicateOfTransactionId).toBeNull();
        expect(dismissed.description).toBe("Grocery run [REF123]");
        const stored = await repository.getById(flaggedId);
        expect(stored?.possibleDuplicateOfTransactionId).toBeNull();
      } finally {
        await admin`delete from transactions where id in (${originalId}, ${flaggedId})`;
        await admin`delete from accounts where id = ${account.id}`;
        await admin`delete from institutions where id = ${institution.id}`;
      }
    });

    it("throws on an unknown transaction id", async () => {
      const ownerId = randomUUID();
      const repository = new PgTransactionRepository(CONNECTION_STRING, ownerId);

      await expect(repository.dismissSuspectedDuplicate(randomUUID())).rejects.toBeInstanceOf(
        TransactionNotFoundError
      );
    });
  });
});
