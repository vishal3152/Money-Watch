import { randomUUID } from "node:crypto";

import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";

import { PgAccountRepository } from "@/db/postgres/repositories/account-repository";
import { PgBalanceSnapshotRepository } from "@/db/postgres/repositories/balance-snapshot-repository";
import { PgFixedDepositRepository } from "@/db/postgres/repositories/fixed-deposit-repository";
import { PgInstitutionRepository } from "@/db/postgres/repositories/institution-repository";
import { PgReconciliationRepository } from "@/db/postgres/repositories/reconciliation-repository";
import { PgTransactionRepository } from "@/db/postgres/repositories/transaction-repository";
import { PgTransferRepository } from "@/db/postgres/repositories/transfer-repository";
import {
  AccountHardDeleteBlockedError,
  AccountNotFoundError,
  EntityHasDependentsError
} from "@/db/errors";

const CONNECTION_STRING =
  process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

const admin = postgres(CONNECTION_STRING, { max: 1 });

afterAll(async () => {
  await admin.end();
});

describe("PgAccountRepository", () => {
  it("listAll() only returns Accounts belonging to the scoped Owner", async () => {
    const ownerA = randomUUID();
    const ownerB = randomUUID();
    const institutionA = { id: randomUUID(), name: "Owner A Bank" };
    const institutionB = { id: randomUUID(), name: "Owner B Bank" };
    const accountA = {
      id: randomUUID(),
      institutionId: institutionA.id,
      name: "Owner A Checking",
      accountNumber: null,
      currencyCode: "USD"
    };
    const accountB = {
      id: randomUUID(),
      institutionId: institutionB.id,
      name: "Owner B Checking",
      accountNumber: null,
      currencyCode: "USD"
    };

    try {
      await new PgInstitutionRepository(CONNECTION_STRING, ownerA).create(institutionA);
      await new PgInstitutionRepository(CONNECTION_STRING, ownerB).create(institutionB);

      const repoA = new PgAccountRepository(CONNECTION_STRING, ownerA);
      const repoB = new PgAccountRepository(CONNECTION_STRING, ownerB);
      await repoA.create(accountA);
      await repoB.create(accountB);

      expect(await repoA.listAll()).toEqual([accountA]);
    } finally {
      await admin`delete from accounts where id in (${accountA.id}, ${accountB.id})`;
      await admin`delete from institutions where id in (${institutionA.id}, ${institutionB.id})`;
    }
  });

  it("listByInstitutionId() only returns that Institution's own Accounts", async () => {
    const ownerId = randomUUID();
    const institutionA = { id: randomUUID(), name: "Bank A" };
    const institutionB = { id: randomUUID(), name: "Bank B" };
    const accountA = {
      id: randomUUID(),
      institutionId: institutionA.id,
      name: "Checking",
      accountNumber: null,
      currencyCode: "USD"
    };
    const accountB = {
      id: randomUUID(),
      institutionId: institutionB.id,
      name: "Savings",
      accountNumber: null,
      currencyCode: "USD"
    };

    try {
      await new PgInstitutionRepository(CONNECTION_STRING, ownerId).create(institutionA);
      await new PgInstitutionRepository(CONNECTION_STRING, ownerId).create(institutionB);

      const repo = new PgAccountRepository(CONNECTION_STRING, ownerId);
      await repo.create(accountA);
      await repo.create(accountB);

      expect(await repo.listByInstitutionId(institutionA.id)).toEqual([accountA]);
    } finally {
      await admin`delete from accounts where id in (${accountA.id}, ${accountB.id})`;
      await admin`delete from institutions where id in (${institutionA.id}, ${institutionB.id})`;
    }
  });

  it("listByInstitutionId() does not leak another Owner's Accounts for an Institution id it does not own", async () => {
    const ownerA = randomUUID();
    const ownerB = randomUUID();
    const institutionB = { id: randomUUID(), name: "Owner B Bank" };
    const accountB = {
      id: randomUUID(),
      institutionId: institutionB.id,
      name: "Owner B Checking",
      accountNumber: null,
      currencyCode: "USD"
    };

    try {
      await new PgInstitutionRepository(CONNECTION_STRING, ownerB).create(institutionB);
      await new PgAccountRepository(CONNECTION_STRING, ownerB).create(accountB);

      const repoA = new PgAccountRepository(CONNECTION_STRING, ownerA);

      expect(await repoA.listByInstitutionId(institutionB.id)).toEqual([]);
    } finally {
      await admin`delete from accounts where id = ${accountB.id}`;
      await admin`delete from institutions where id = ${institutionB.id}`;
    }
  });

  it("rejects an Account referencing another Owner's Institution, even though the id exists", async () => {
    const ownerA = randomUUID();
    const ownerB = randomUUID();
    const institutionB = { id: randomUUID(), name: "Owner B Bank" };

    try {
      await new PgInstitutionRepository(CONNECTION_STRING, ownerB).create(institutionB);

      const repoA = new PgAccountRepository(CONNECTION_STRING, ownerA);

      await expect(
        repoA.create({
          id: randomUUID(),
          institutionId: institutionB.id,
          name: "Cross-owner Account",
          accountNumber: null,
          currencyCode: "USD"
        })
      ).rejects.toThrow();
    } finally {
      await admin`delete from institutions where id = ${institutionB.id}`;
    }
  });

  it("updates an Account's name and account number", async () => {
    const ownerId = randomUUID();
    const institution = { id: randomUUID(), name: "Bank" };
    const account = {
      id: randomUUID(),
      institutionId: institution.id,
      name: "Checking",
      accountNumber: null,
      currencyCode: "USD"
    };

    try {
      await new PgInstitutionRepository(CONNECTION_STRING, ownerId).create(institution);
      const repo = new PgAccountRepository(CONNECTION_STRING, ownerId);
      await repo.create(account);

      const updated = await repo.update(account.id, { name: "Primary Checking", accountNumber: "999" });

      expect(updated).toEqual({ ...account, name: "Primary Checking", accountNumber: "999" });
      expect(await repo.getById(account.id)).toEqual({
        ...account,
        name: "Primary Checking",
        accountNumber: "999"
      });
    } finally {
      await admin`delete from accounts where id = ${account.id}`;
      await admin`delete from institutions where id = ${institution.id}`;
    }
  });

  it("rejects updating an Account belonging to another Owner", async () => {
    const ownerA = randomUUID();
    const ownerB = randomUUID();
    const institution = { id: randomUUID(), name: "Owner B Bank" };
    const account = {
      id: randomUUID(),
      institutionId: institution.id,
      name: "Owner B Checking",
      accountNumber: null,
      currencyCode: "USD"
    };

    try {
      await new PgInstitutionRepository(CONNECTION_STRING, ownerB).create(institution);
      await new PgAccountRepository(CONNECTION_STRING, ownerB).create(account);

      const repoA = new PgAccountRepository(CONNECTION_STRING, ownerA);

      await expect(repoA.update(account.id, { name: "Hijacked" })).rejects.toBeInstanceOf(
        AccountNotFoundError
      );
    } finally {
      await admin`delete from accounts where id = ${account.id}`;
      await admin`delete from institutions where id = ${institution.id}`;
    }
  });

  it("deletes an Account with no dependent Transactions", async () => {
    const ownerId = randomUUID();
    const institution = { id: randomUUID(), name: "Bank" };
    const account = {
      id: randomUUID(),
      institutionId: institution.id,
      name: "Checking",
      accountNumber: null,
      currencyCode: "USD"
    };

    try {
      await new PgInstitutionRepository(CONNECTION_STRING, ownerId).create(institution);
      const repo = new PgAccountRepository(CONNECTION_STRING, ownerId);
      await repo.create(account);

      await repo.delete(account.id);

      expect(await repo.listAll()).toEqual([]);
    } finally {
      await admin`delete from accounts where id = ${account.id}`;
      await admin`delete from institutions where id = ${institution.id}`;
    }
  });

  it("rejects deleting an Account that still has a Transaction", async () => {
    const ownerId = randomUUID();
    const institution = { id: randomUUID(), name: "Bank" };
    const account = {
      id: randomUUID(),
      institutionId: institution.id,
      name: "Checking",
      accountNumber: null,
      currencyCode: "USD"
    };
    const transaction = {
      id: randomUUID(),
      accountId: account.id,
      amountMinor: 1_000,
      occurredAt: "2026-01-01T00:00:00.000Z",
      description: "Deposit",
      trustStatus: "Confirmed" as const,
      transferId: null,
      category: null,
      importBatchId: null
    };

    try {
      await new PgInstitutionRepository(CONNECTION_STRING, ownerId).create(institution);
      const repo = new PgAccountRepository(CONNECTION_STRING, ownerId);
      await repo.create(account);
      await new PgTransactionRepository(CONNECTION_STRING, ownerId).create(transaction);

      await expect(repo.delete(account.id)).rejects.toBeInstanceOf(EntityHasDependentsError);
      expect(await repo.listAll()).toEqual([account]);
    } finally {
      await admin`delete from transactions where id = ${transaction.id}`;
      await admin`delete from accounts where id = ${account.id}`;
      await admin`delete from institutions where id = ${institution.id}`;
    }
  });

  it("hardDelete() removes an Account along with its Transactions, Reconciliation, Discrepancy, and Adjustment", async () => {
    const ownerId = randomUUID();
    const institution = { id: randomUUID(), name: "Bank One" };
    const account = {
      id: randomUUID(),
      institutionId: institution.id,
      name: "Savings",
      accountNumber: null,
      currencyCode: "INR"
    };
    const snapshotId = randomUUID();
    const reconciliationId = randomUUID();
    const transactionId = randomUUID();
    const adjustmentTransactionId = randomUUID();
    const discrepancyId = `${reconciliationId}-discrepancy`;

    try {
      await new PgInstitutionRepository(CONNECTION_STRING, ownerId).create(institution);
      const repo = new PgAccountRepository(CONNECTION_STRING, ownerId);
      await repo.create(account);
      await new PgTransactionRepository(CONNECTION_STRING, ownerId).create({
        id: transactionId,
        accountId: account.id,
        amountMinor: 1_000,
        occurredAt: "2026-01-01T00:00:00.000Z",
        description: "Deposit",
        trustStatus: "Confirmed",
        transferId: null,
        category: null,
        importBatchId: null
      });
      await new PgBalanceSnapshotRepository(CONNECTION_STRING, ownerId).create({
        id: snapshotId,
        accountId: account.id,
        asOfDate: "2026-01-31",
        balanceMinor: 500
      });
      const reconciliationRepo = new PgReconciliationRepository(CONNECTION_STRING, ownerId);
      await reconciliationRepo.create({
        id: reconciliationId,
        accountId: account.id,
        balanceSnapshotId: snapshotId,
        reconciledAt: "2026-02-01T00:00:00.000Z"
      });
      await reconciliationRepo.resolveWithAdjustment(discrepancyId, {
        id: adjustmentTransactionId,
        accountId: account.id,
        amountMinor: -500,
        occurredAt: "2026-02-01T00:00:00.000Z",
        description: "Adjustment"
      });

      await repo.hardDelete(account.id);

      expect(await repo.getById(account.id)).toBeNull();
      expect(
        await new PgTransactionRepository(CONNECTION_STRING, ownerId).getById(transactionId)
      ).toBeNull();
      expect(
        await new PgTransactionRepository(CONNECTION_STRING, ownerId).getById(adjustmentTransactionId)
      ).toBeNull();
      expect(await reconciliationRepo.getById(reconciliationId)).toBeNull();
      expect(await reconciliationRepo.getDiscrepancyByReconciliationId(reconciliationId)).toBeNull();
    } finally {
      await admin`delete from adjustments where transaction_id in (${transactionId}, ${adjustmentTransactionId})`;
      await admin`delete from discrepancies where id = ${discrepancyId}`;
      await admin`delete from transactions where id in (${transactionId}, ${adjustmentTransactionId})`;
      await admin`delete from reconciliations where id = ${reconciliationId}`;
      await admin`delete from balance_snapshots where id = ${snapshotId}`;
      await admin`delete from accounts where id = ${account.id}`;
      await admin`delete from institutions where id = ${institution.id}`;
    }
  });

  it("hardDelete() on an Account whose ImportBatch a processed_email_alerts row still points at nulls that reference instead of failing", async () => {
    // Regression: postgres/migrations/20260911020000_processed_email_alerts.sql declared the FK
    // with no ON DELETE clause, so Postgres defaulted to NO ACTION and this delete failed with a
    // foreign key violation (reproduced live via /accounts/:id/delete, 2026-09-14).
    const ownerId = randomUUID();
    const institution = { id: randomUUID(), name: "Bank" };
    const account = {
      id: randomUUID(),
      institutionId: institution.id,
      name: "Checking",
      accountNumber: null,
      currencyCode: "USD"
    };
    const batchId = randomUUID();
    const alertId = randomUUID();

    try {
      await new PgInstitutionRepository(CONNECTION_STRING, ownerId).create(institution);
      const repo = new PgAccountRepository(CONNECTION_STRING, ownerId);
      await repo.create(account);
      await admin`
        insert into import_batches (id, owner_id, account_id, source, created_at)
        values (${batchId}, ${ownerId}, ${account.id}, 'statement.pdf', '2026-02-01T00:00:00.000Z')
      `;
      await admin`
        insert into processed_email_alerts
          (id, owner_id, mailbox, message_uid, status, processed_at, import_batch_id)
        values
          (${alertId}, ${ownerId}, 'inbox@example.com', '1:1', 'matched', '2026-02-01T00:00:00.000Z', ${batchId})
      `;

      await repo.hardDelete(account.id);

      expect(await repo.getById(account.id)).toBeNull();
      const [alertRow] = await admin`select import_batch_id from processed_email_alerts where id = ${alertId}`;
      expect(alertRow?.import_batch_id).toBeNull();
    } finally {
      await admin`delete from processed_email_alerts where id = ${alertId}`;
      await admin`delete from import_batches where id = ${batchId}`;
      await admin`delete from accounts where id = ${account.id}`;
      await admin`delete from institutions where id = ${institution.id}`;
    }
  });

  it("rejects hardDelete() of an Account a FixedDeposit is linked to", async () => {
    const ownerId = randomUUID();
    const institution = { id: randomUUID(), name: "Bank One" };
    const account = {
      id: randomUUID(),
      institutionId: institution.id,
      name: "Savings",
      accountNumber: null,
      currencyCode: "INR"
    };
    const fixedDepositId = randomUUID();

    try {
      await new PgInstitutionRepository(CONNECTION_STRING, ownerId).create(institution);
      const repo = new PgAccountRepository(CONNECTION_STRING, ownerId);
      await repo.create(account);
      await new PgFixedDepositRepository(CONNECTION_STRING, ownerId).create({
        id: fixedDepositId,
        name: "Term deposit",
        accountNumber: null,
        institutionId: institution.id,
        linkedAccountId: account.id,
        principalMinor: 100_000,
        originalPrincipalMinor: 100_000,
        currencyCode: "INR",
        interestRateBps: 650,
        openedDate: "2026-01-01",
        maturityDate: "2027-01-01",
        status: "Open"
      });

      await expect(repo.hardDelete(account.id)).rejects.toBeInstanceOf(EntityHasDependentsError);
      expect(await repo.getById(account.id)).not.toBeNull();
    } finally {
      await admin`delete from fixed_deposits where id = ${fixedDepositId}`;
      await admin`delete from accounts where id = ${account.id}`;
      await admin`delete from institutions where id = ${institution.id}`;
    }
  });

  it("hardDelete() removes a Transfer and both linked Transactions when the other Account has not reconciled it", async () => {
    const ownerId = randomUUID();
    const institution = { id: randomUUID(), name: "Bank One" };
    const accountA = {
      id: randomUUID(),
      institutionId: institution.id,
      name: "Savings",
      accountNumber: null,
      currencyCode: "INR"
    };
    const accountB = {
      id: randomUUID(),
      institutionId: institution.id,
      name: "Checking",
      accountNumber: null,
      currencyCode: "INR"
    };
    const transferId = randomUUID();

    try {
      await new PgInstitutionRepository(CONNECTION_STRING, ownerId).create(institution);
      const repo = new PgAccountRepository(CONNECTION_STRING, ownerId);
      await repo.create(accountA);
      await repo.create(accountB);
      const transferRepo = new PgTransferRepository(CONNECTION_STRING, ownerId);
      await transferRepo.create({
        id: transferId,
        sourceAccountId: accountA.id,
        sourceFixedDepositId: null,
        sourceAmountMinor: 1_000,
        sourceCurrencyCode: "INR",
        destinationAccountId: accountB.id,
        destinationFixedDepositId: null,
        destinationAmountMinor: 1_000,
        destinationCurrencyCode: "INR",
        occurredAt: "2026-01-01T00:00:00.000Z",
        description: "Move to checking",
        purpose: "general"
      });

      await repo.hardDelete(accountA.id);

      expect(await repo.getById(accountA.id)).toBeNull();
      expect(await transferRepo.getById(transferId)).toBeNull();
      expect(
        await new PgTransactionRepository(CONNECTION_STRING, ownerId).getById(`${transferId}-source`)
      ).toBeNull();
      expect(
        await new PgTransactionRepository(CONNECTION_STRING, ownerId).getById(`${transferId}-destination`)
      ).toBeNull();
      expect(await repo.getById(accountB.id)).not.toBeNull();
    } finally {
      await admin`delete from transactions where transfer_id = ${transferId}`;
      await admin`delete from transfers where id = ${transferId}`;
      await admin`delete from accounts where id in (${accountA.id}, ${accountB.id})`;
      await admin`delete from institutions where id = ${institution.id}`;
    }
  });

  it("rejects hardDelete() when the other side of a Transfer has already reconciled it", async () => {
    const ownerId = randomUUID();
    const institution = { id: randomUUID(), name: "Bank One" };
    const accountA = {
      id: randomUUID(),
      institutionId: institution.id,
      name: "Savings",
      accountNumber: null,
      currencyCode: "INR"
    };
    const accountB = {
      id: randomUUID(),
      institutionId: institution.id,
      name: "Checking",
      accountNumber: null,
      currencyCode: "INR"
    };
    const transferId = randomUUID();
    const snapshotId = randomUUID();
    const reconciliationId = randomUUID();

    try {
      await new PgInstitutionRepository(CONNECTION_STRING, ownerId).create(institution);
      const repo = new PgAccountRepository(CONNECTION_STRING, ownerId);
      await repo.create(accountA);
      await repo.create(accountB);
      const transferRepo = new PgTransferRepository(CONNECTION_STRING, ownerId);
      await transferRepo.create({
        id: transferId,
        sourceAccountId: accountA.id,
        sourceFixedDepositId: null,
        sourceAmountMinor: 1_000,
        sourceCurrencyCode: "INR",
        destinationAccountId: accountB.id,
        destinationFixedDepositId: null,
        destinationAmountMinor: 1_000,
        destinationCurrencyCode: "INR",
        occurredAt: "2026-01-01T00:00:00.000Z",
        description: "Move to checking",
        purpose: "general"
      });
      await new PgBalanceSnapshotRepository(CONNECTION_STRING, ownerId).create({
        id: snapshotId,
        accountId: accountB.id,
        asOfDate: "2026-01-31",
        balanceMinor: 1_000
      });
      await new PgReconciliationRepository(CONNECTION_STRING, ownerId).create({
        id: reconciliationId,
        accountId: accountB.id,
        balanceSnapshotId: snapshotId,
        reconciledAt: "2026-02-01T00:00:00.000Z"
      });

      await expect(repo.hardDelete(accountA.id)).rejects.toBeInstanceOf(AccountHardDeleteBlockedError);
      expect(await repo.getById(accountA.id)).not.toBeNull();
      expect(await transferRepo.getById(transferId)).not.toBeNull();
    } finally {
      await admin`delete from reconciliations where id = ${reconciliationId}`;
      await admin`delete from balance_snapshots where id = ${snapshotId}`;
      await admin`delete from transactions where transfer_id = ${transferId}`;
      await admin`delete from transfers where id = ${transferId}`;
      await admin`delete from accounts where id in (${accountA.id}, ${accountB.id})`;
      await admin`delete from institutions where id = ${institution.id}`;
    }
  });

  it("hardDelete() on a nonexistent Account is a no-op", async () => {
    const ownerId = randomUUID();
    const repo = new PgAccountRepository(CONNECTION_STRING, ownerId);

    await expect(repo.hardDelete(randomUUID())).resolves.toBeUndefined();
  });
});
