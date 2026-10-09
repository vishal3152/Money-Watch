import { randomUUID } from "node:crypto";

import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";

import { PgAccountRepository } from "@/db/postgres/repositories/account-repository";
import { PgFixedDepositRepository } from "@/db/postgres/repositories/fixed-deposit-repository";
import { PgInstitutionRepository } from "@/db/postgres/repositories/institution-repository";
import { PgTransactionRepository } from "@/db/postgres/repositories/transaction-repository";
import { PgTransferRepository } from "@/db/postgres/repositories/transfer-repository";
import { TransferNotEditableError, TransferNotFoundError } from "@/db/errors";

const CONNECTION_STRING =
  process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

const admin = postgres(CONNECTION_STRING, { max: 1 });

afterAll(async () => {
  await admin.end();
});

async function seedOwnerWithTwoAccounts(ownerId: string) {
  const institution = { id: randomUUID(), name: "Bank" };
  const accountA = {
    id: randomUUID(),
    institutionId: institution.id,
    name: "Checking",
    accountNumber: null,
    currencyCode: "USD"
  };
  const accountB = {
    id: randomUUID(),
    institutionId: institution.id,
    name: "Savings",
    accountNumber: null,
    currencyCode: "USD"
  };

  await new PgInstitutionRepository(CONNECTION_STRING, ownerId).create(institution);
  await new PgAccountRepository(CONNECTION_STRING, ownerId).create(accountA);
  await new PgAccountRepository(CONNECTION_STRING, ownerId).create(accountB);

  return { institution, accountA, accountB };
}

async function cleanup(ids: {
  transferIds?: string[];
  transactionIds?: string[];
  fixedDepositIds?: string[];
  accountIds?: string[];
  institutionIds?: string[];
}) {
  if (ids.transactionIds?.length) {
    await admin`delete from transactions where id = any(${ids.transactionIds})`;
  }
  if (ids.transferIds?.length) {
    await admin`delete from transfers where id = any(${ids.transferIds})`;
  }
  if (ids.fixedDepositIds?.length) {
    await admin`delete from fixed_deposits where id = any(${ids.fixedDepositIds})`;
  }
  if (ids.accountIds?.length) {
    await admin`delete from accounts where id = any(${ids.accountIds})`;
  }
  if (ids.institutionIds?.length) {
    await admin`delete from institutions where id = any(${ids.institutionIds})`;
  }
}

describe("PgTransferRepository", () => {
  it("Account-to-Account transfer materializes two opposite-signed linked Transactions", async () => {
    const ownerId = randomUUID();
    const { institution, accountA, accountB } = await seedOwnerWithTwoAccounts(ownerId);
    const transferId = randomUUID();

    try {
      const repo = new PgTransferRepository(CONNECTION_STRING, ownerId);
      await repo.create({
        id: transferId,
        sourceAccountId: accountA.id,
        sourceFixedDepositId: null,
        sourceAmountMinor: 5000,
        sourceCurrencyCode: "USD",
        destinationAccountId: accountB.id,
        destinationFixedDepositId: null,
        destinationAmountMinor: 5000,
        destinationCurrencyCode: "USD",
        occurredAt: "2026-01-01T00:00:00.000Z",
        description: "Move to savings",
        purpose: "general"
      });

      const txRepo = new PgTransactionRepository(CONNECTION_STRING, ownerId);
      const sourceTx = await txRepo.listByAccountId(accountA.id);
      const destTx = await txRepo.listByAccountId(accountB.id);

      expect(sourceTx).toEqual([
        expect.objectContaining({ amountMinor: -5000, transferId, id: `${transferId}-source` })
      ]);
      expect(destTx).toEqual([
        expect.objectContaining({ amountMinor: 5000, transferId, id: `${transferId}-destination` })
      ]);

      const found = await repo.listByLeg(accountA.id);
      expect(found.map((t) => t.id)).toEqual([transferId]);
    } finally {
      await cleanup({
        transactionIds: [`${transferId}-source`, `${transferId}-destination`],
        transferIds: [transferId],
        accountIds: [accountA.id, accountB.id],
        institutionIds: [institution.id]
      });
    }
  });

  it("only returns the scoped Owner's Transfers via listByLeg", async () => {
    const ownerA = randomUUID();
    const ownerB = randomUUID();
    const seedA = await seedOwnerWithTwoAccounts(ownerA);
    const seedB = await seedOwnerWithTwoAccounts(ownerB);
    const transferA = randomUUID();
    const transferB = randomUUID();

    try {
      await new PgTransferRepository(CONNECTION_STRING, ownerA).create({
        id: transferA,
        sourceAccountId: seedA.accountA.id,
        sourceFixedDepositId: null,
        sourceAmountMinor: 1000,
        sourceCurrencyCode: "USD",
        destinationAccountId: seedA.accountB.id,
        destinationFixedDepositId: null,
        destinationAmountMinor: 1000,
        destinationCurrencyCode: "USD",
        occurredAt: "2026-01-01T00:00:00.000Z",
        description: "A",
        purpose: "general"
      });
      await new PgTransferRepository(CONNECTION_STRING, ownerB).create({
        id: transferB,
        sourceAccountId: seedB.accountA.id,
        sourceFixedDepositId: null,
        sourceAmountMinor: 1000,
        sourceCurrencyCode: "USD",
        destinationAccountId: seedB.accountB.id,
        destinationFixedDepositId: null,
        destinationAmountMinor: 1000,
        destinationCurrencyCode: "USD",
        occurredAt: "2026-01-01T00:00:00.000Z",
        description: "B",
        purpose: "general"
      });

      const repoA = new PgTransferRepository(CONNECTION_STRING, ownerA);
      expect((await repoA.listByLeg(seedA.accountA.id)).map((t) => t.id)).toEqual([transferA]);
    } finally {
      await cleanup({
        transactionIds: [
          `${transferA}-source`,
          `${transferA}-destination`,
          `${transferB}-source`,
          `${transferB}-destination`
        ],
        transferIds: [transferA, transferB],
        accountIds: [seedA.accountA.id, seedA.accountB.id, seedB.accountA.id, seedB.accountB.id],
        institutionIds: [seedA.institution.id, seedB.institution.id]
      });
    }
  });

  describe("getTransferImpactByAccountId", () => {
    it("counts Transfers touching an Account and names the Account counterparty", async () => {
      const ownerId = randomUUID();
      const { institution, accountA, accountB } = await seedOwnerWithTwoAccounts(ownerId);
      const transferId = randomUUID();

      try {
        await new PgTransferRepository(CONNECTION_STRING, ownerId).create({
          id: transferId,
          sourceAccountId: accountA.id,
          sourceFixedDepositId: null,
          sourceAmountMinor: 5000,
          sourceCurrencyCode: "USD",
          destinationAccountId: accountB.id,
          destinationFixedDepositId: null,
          destinationAmountMinor: 5000,
          destinationCurrencyCode: "USD",
          occurredAt: "2026-01-01T00:00:00.000Z",
          description: "Move to savings",
          purpose: "general"
        });

        const repo = new PgTransferRepository(CONNECTION_STRING, ownerId);
        const impact = await repo.getTransferImpactByAccountId(accountA.id);

        expect(impact).toEqual({ transferCount: 1, counterpartyAccountNames: ["Savings"] });
      } finally {
        await cleanup({
          transactionIds: [`${transferId}-source`, `${transferId}-destination`],
          transferIds: [transferId],
          accountIds: [accountA.id, accountB.id],
          institutionIds: [institution.id]
        });
      }
    });

    it("does not leak another Owner's Transfers for an Account id it does not own", async () => {
      const ownerA = randomUUID();
      const ownerB = randomUUID();
      const seedB = await seedOwnerWithTwoAccounts(ownerB);
      const transferB = randomUUID();

      try {
        await new PgTransferRepository(CONNECTION_STRING, ownerB).create({
          id: transferB,
          sourceAccountId: seedB.accountA.id,
          sourceFixedDepositId: null,
          sourceAmountMinor: 1000,
          sourceCurrencyCode: "USD",
          destinationAccountId: seedB.accountB.id,
          destinationFixedDepositId: null,
          destinationAmountMinor: 1000,
          destinationCurrencyCode: "USD",
          occurredAt: "2026-01-01T00:00:00.000Z",
          description: "B",
          purpose: "general"
        });

        const repoA = new PgTransferRepository(CONNECTION_STRING, ownerA);

        expect(await repoA.getTransferImpactByAccountId(seedB.accountA.id)).toEqual({
          transferCount: 0,
          counterpartyAccountNames: []
        });
      } finally {
        await cleanup({
          transactionIds: [`${transferB}-source`, `${transferB}-destination`],
          transferIds: [transferB],
          accountIds: [seedB.accountA.id, seedB.accountB.id],
          institutionIds: [seedB.institution.id]
        });
      }
    });
  });

  it("opening + top-up + withdrawal transitions a FixedDeposit's principal and status", async () => {
    const ownerId = randomUUID();
    const { institution, accountA: fundingAccount, accountB: unusedAccount } = await seedOwnerWithTwoAccounts(
      ownerId
    );
    const fixedDepositId = randomUUID();
    const openingTransferId = randomUUID();
    const topUpTransferId = randomUUID();
    const withdrawalTransferId = randomUUID();

    const fixedDeposit = {
      id: fixedDepositId,
      name: "1yr FD",
      accountNumber: null,
      institutionId: institution.id,
      linkedAccountId: fundingAccount.id,
      principalMinor: 10_000,
      originalPrincipalMinor: 10_000,
      currencyCode: "USD",
      interestRateBps: 500,
      openedDate: "2026-01-01",
      maturityDate: "2099-01-01",
      status: "Open" as const
    };

    try {
      await new PgFixedDepositRepository(CONNECTION_STRING, ownerId).create(fixedDeposit);
      const transferRepo = new PgTransferRepository(CONNECTION_STRING, ownerId);

      await transferRepo.create({
        id: openingTransferId,
        sourceAccountId: fundingAccount.id,
        sourceFixedDepositId: null,
        sourceAmountMinor: 10_000,
        sourceCurrencyCode: "USD",
        destinationAccountId: null,
        destinationFixedDepositId: fixedDepositId,
        destinationAmountMinor: 10_000,
        destinationCurrencyCode: "USD",
        occurredAt: "2026-01-01T00:00:00.000Z",
        description: "Open FD",
        purpose: "fixed-deposit-opening"
      });

      await transferRepo.create({
        id: topUpTransferId,
        sourceAccountId: fundingAccount.id,
        sourceFixedDepositId: null,
        sourceAmountMinor: 2_000,
        sourceCurrencyCode: "USD",
        destinationAccountId: null,
        destinationFixedDepositId: fixedDepositId,
        destinationAmountMinor: 2_000,
        destinationCurrencyCode: "USD",
        occurredAt: "2026-02-01T00:00:00.000Z",
        description: "Top up FD",
        purpose: "fixed-deposit-top-up"
      });

      const afterTopUp = await new PgFixedDepositRepository(CONNECTION_STRING, ownerId).getById(fixedDepositId);
      expect(afterTopUp?.principalMinor).toBe(12_000);
      expect(afterTopUp?.status).toBe("Open");

      await transferRepo.create({
        id: withdrawalTransferId,
        sourceAccountId: null,
        sourceFixedDepositId: fixedDepositId,
        sourceAmountMinor: 12_000,
        sourceCurrencyCode: "USD",
        destinationAccountId: fundingAccount.id,
        destinationFixedDepositId: null,
        destinationAmountMinor: 12_000,
        destinationCurrencyCode: "USD",
        occurredAt: "2026-03-01T00:00:00.000Z",
        description: "Withdraw FD",
        purpose: "fixed-deposit-withdrawal"
      });

      const afterWithdrawal = await new PgFixedDepositRepository(CONNECTION_STRING, ownerId).getById(
        fixedDepositId
      );
      expect(afterWithdrawal?.principalMinor).toBe(0);
      expect(afterWithdrawal?.status).toBe("PrematurelyClosed");
    } finally {
      await cleanup({
        transactionIds: [
          `${openingTransferId}-source`,
          `${topUpTransferId}-source`,
          `${withdrawalTransferId}-destination`
        ],
        transferIds: [openingTransferId, topUpTransferId, withdrawalTransferId],
        fixedDepositIds: [fixedDepositId],
        accountIds: [fundingAccount.id, unusedAccount.id],
        institutionIds: [institution.id]
      });
    }
  });

  it("deletes linked Transactions and recomputes FixedDeposit principal after removing a top-up", async () => {
    const ownerId = randomUUID();
    const { institution, accountA: fundingAccount, accountB: unusedAccount } =
      await seedOwnerWithTwoAccounts(ownerId);
    const fixedDepositId = randomUUID();
    const openingTransferId = randomUUID();
    const topUpTransferId = randomUUID();

    try {
      await new PgFixedDepositRepository(CONNECTION_STRING, ownerId).create({
        id: fixedDepositId,
        name: "1yr FD",
        accountNumber: null,
        institutionId: institution.id,
        linkedAccountId: fundingAccount.id,
        principalMinor: 10_000,
        originalPrincipalMinor: 10_000,
        currencyCode: "USD",
        interestRateBps: 500,
        openedDate: "2026-01-01",
        maturityDate: "2099-01-01",
        status: "Open"
      });

      const transferRepo = new PgTransferRepository(CONNECTION_STRING, ownerId);
      await transferRepo.create({
        id: openingTransferId,
        sourceAccountId: fundingAccount.id,
        sourceFixedDepositId: null,
        sourceAmountMinor: 10_000,
        sourceCurrencyCode: "USD",
        destinationAccountId: null,
        destinationFixedDepositId: fixedDepositId,
        destinationAmountMinor: 10_000,
        destinationCurrencyCode: "USD",
        occurredAt: "2026-01-01T00:00:00.000Z",
        description: "Open FD",
        purpose: "fixed-deposit-opening"
      });
      await transferRepo.create({
        id: topUpTransferId,
        sourceAccountId: fundingAccount.id,
        sourceFixedDepositId: null,
        sourceAmountMinor: 2_000,
        sourceCurrencyCode: "USD",
        destinationAccountId: null,
        destinationFixedDepositId: fixedDepositId,
        destinationAmountMinor: 2_000,
        destinationCurrencyCode: "USD",
        occurredAt: "2026-02-01T00:00:00.000Z",
        description: "Top up FD",
        purpose: "fixed-deposit-top-up"
      });

      await transferRepo.delete(topUpTransferId);

      expect(await transferRepo.getById(topUpTransferId)).toBeNull();
      const fundingTx = await new PgTransactionRepository(CONNECTION_STRING, ownerId).listByAccountId(
        fundingAccount.id
      );
      expect(fundingTx.map((t) => t.id)).toEqual([`${openingTransferId}-source`]);

      const afterDelete = await new PgFixedDepositRepository(CONNECTION_STRING, ownerId).getById(
        fixedDepositId
      );
      expect(afterDelete?.principalMinor).toBe(10_000);
      expect(afterDelete?.status).toBe("Open");
    } finally {
      await cleanup({
        transactionIds: [`${openingTransferId}-source`, `${topUpTransferId}-source`],
        transferIds: [openingTransferId, topUpTransferId],
        fixedDepositIds: [fixedDepositId],
        accountIds: [fundingAccount.id, unusedAccount.id],
        institutionIds: [institution.id]
      });
    }
  });

  it("reverts a matured FixedDeposit back to Open when its maturity Transfer is deleted", async () => {
    const ownerId = randomUUID();
    const { institution, accountA: linkedAccount, accountB: unusedAccount } =
      await seedOwnerWithTwoAccounts(ownerId);
    const fixedDepositId = randomUUID();
    const maturityTransferId = randomUUID();

    try {
      await new PgFixedDepositRepository(CONNECTION_STRING, ownerId).create({
        id: fixedDepositId,
        name: "Matured FD",
        accountNumber: null,
        institutionId: institution.id,
        linkedAccountId: linkedAccount.id,
        principalMinor: 10_000,
        originalPrincipalMinor: 10_000,
        currencyCode: "USD",
        interestRateBps: 500,
        openedDate: "2025-01-01",
        maturityDate: "2026-01-01",
        status: "Open"
      });

      const transferRepo = new PgTransferRepository(CONNECTION_STRING, ownerId);
      await transferRepo.create({
        id: maturityTransferId,
        sourceAccountId: null,
        sourceFixedDepositId: fixedDepositId,
        sourceAmountMinor: 10_500,
        sourceCurrencyCode: "USD",
        destinationAccountId: linkedAccount.id,
        destinationFixedDepositId: null,
        destinationAmountMinor: 10_500,
        destinationCurrencyCode: "USD",
        occurredAt: "2026-01-01T00:00:00.000Z",
        description: "Maturity payout",
        purpose: "fixed-deposit-withdrawal"
      });

      expect(
        (await new PgFixedDepositRepository(CONNECTION_STRING, ownerId).getById(fixedDepositId))?.status
      ).toBe("Matured");

      await transferRepo.delete(maturityTransferId);

      const afterDelete = await new PgFixedDepositRepository(CONNECTION_STRING, ownerId).getById(
        fixedDepositId
      );
      expect(afterDelete?.principalMinor).toBe(10_000);
      expect(afterDelete?.status).toBe("Open");
      expect(
        await new PgTransactionRepository(CONNECTION_STRING, ownerId).listByAccountId(linkedAccount.id)
      ).toEqual([]);
    } finally {
      await cleanup({
        transactionIds: [`${maturityTransferId}-destination`],
        transferIds: [maturityTransferId],
        fixedDepositIds: [fixedDepositId],
        accountIds: [linkedAccount.id, unusedAccount.id],
        institutionIds: [institution.id]
      });
    }
  });

  describe("update", () => {
    it("replaces a general Transfer's amounts and its linked Transactions, scoped to the Owner", async () => {
      const ownerId = randomUUID();
      const { institution, accountA, accountB } = await seedOwnerWithTwoAccounts(ownerId);
      const transferId = randomUUID();

      try {
        const repo = new PgTransferRepository(CONNECTION_STRING, ownerId);
        await repo.create({
          id: transferId,
          sourceAccountId: accountA.id,
          sourceFixedDepositId: null,
          sourceAmountMinor: 5000,
          sourceCurrencyCode: "USD",
          destinationAccountId: accountB.id,
          destinationFixedDepositId: null,
          destinationAmountMinor: 5000,
          destinationCurrencyCode: "USD",
          occurredAt: "2026-01-01T00:00:00.000Z",
          description: "Move to savings",
          purpose: "general"
        });

        const updated = await repo.update(transferId, {
          sourceAccountId: accountA.id,
          sourceFixedDepositId: null,
          sourceAmountMinor: 9000,
          sourceCurrencyCode: "USD",
          destinationAccountId: accountB.id,
          destinationFixedDepositId: null,
          destinationAmountMinor: 9000,
          destinationCurrencyCode: "USD",
          occurredAt: "2026-01-02T00:00:00.000Z",
          description: "Corrected move",
          purpose: "general"
        });

        expect(updated.sourceAmountMinor).toBe(9000);
        expect(updated.description).toBe("Corrected move");
        expect(await repo.getById(transferId)).toEqual(updated);

        const sourceTx = await new PgTransactionRepository(CONNECTION_STRING, ownerId).listByAccountId(
          accountA.id
        );
        expect(sourceTx).toEqual([
          expect.objectContaining({ id: `${transferId}-source`, amountMinor: -9000 })
        ]);
      } finally {
        await cleanup({
          transactionIds: [`${transferId}-source`, `${transferId}-destination`],
          transferIds: [transferId],
          accountIds: [accountA.id, accountB.id],
          institutionIds: [institution.id]
        });
      }
    });

    it("rejects editing an opening Transfer", async () => {
      const ownerId = randomUUID();
      const { institution, accountA: fundingAccount, accountB: unusedAccount } =
        await seedOwnerWithTwoAccounts(ownerId);
      const fixedDepositId = randomUUID();
      const openingTransferId = randomUUID();

      try {
        await new PgFixedDepositRepository(CONNECTION_STRING, ownerId).create({
          id: fixedDepositId,
          name: "1yr FD",
          accountNumber: null,
          institutionId: institution.id,
          linkedAccountId: fundingAccount.id,
          principalMinor: 10_000,
          originalPrincipalMinor: 10_000,
          currencyCode: "USD",
          interestRateBps: 500,
          openedDate: "2026-01-01",
          maturityDate: "2099-01-01",
          status: "Open"
        });
        const repo = new PgTransferRepository(CONNECTION_STRING, ownerId);
        await repo.create({
          id: openingTransferId,
          sourceAccountId: fundingAccount.id,
          sourceFixedDepositId: null,
          sourceAmountMinor: 10_000,
          sourceCurrencyCode: "USD",
          destinationAccountId: null,
          destinationFixedDepositId: fixedDepositId,
          destinationAmountMinor: 10_000,
          destinationCurrencyCode: "USD",
          occurredAt: "2026-01-01T00:00:00.000Z",
          description: "Open FD",
          purpose: "fixed-deposit-opening"
        });

        await expect(
          repo.update(openingTransferId, {
            sourceAccountId: fundingAccount.id,
            sourceFixedDepositId: null,
            sourceAmountMinor: 10_000,
            sourceCurrencyCode: "USD",
            destinationAccountId: null,
            destinationFixedDepositId: fixedDepositId,
            destinationAmountMinor: 10_000,
            destinationCurrencyCode: "USD",
            occurredAt: "2026-01-01T00:00:00.000Z",
            description: "Changed",
            purpose: "fixed-deposit-opening"
          })
        ).rejects.toBeInstanceOf(TransferNotEditableError);
      } finally {
        await cleanup({
          transactionIds: [`${openingTransferId}-source`],
          transferIds: [openingTransferId],
          fixedDepositIds: [fixedDepositId],
          accountIds: [fundingAccount.id, unusedAccount.id],
          institutionIds: [institution.id]
        });
      }
    });

    it("recomputes FixedDeposit principal after editing a top-up amount", async () => {
      const ownerId = randomUUID();
      const { institution, accountA: fundingAccount, accountB: unusedAccount } =
        await seedOwnerWithTwoAccounts(ownerId);
      const fixedDepositId = randomUUID();
      const topUpTransferId = randomUUID();

      try {
        await new PgFixedDepositRepository(CONNECTION_STRING, ownerId).create({
          id: fixedDepositId,
          name: "1yr FD",
          accountNumber: null,
          institutionId: institution.id,
          linkedAccountId: fundingAccount.id,
          principalMinor: 10_000,
          originalPrincipalMinor: 10_000,
          currencyCode: "USD",
          interestRateBps: 500,
          openedDate: "2026-01-01",
          maturityDate: "2099-01-01",
          status: "Open"
        });
        const repo = new PgTransferRepository(CONNECTION_STRING, ownerId);
        await repo.create({
          id: topUpTransferId,
          sourceAccountId: fundingAccount.id,
          sourceFixedDepositId: null,
          sourceAmountMinor: 2_000,
          sourceCurrencyCode: "USD",
          destinationAccountId: null,
          destinationFixedDepositId: fixedDepositId,
          destinationAmountMinor: 2_000,
          destinationCurrencyCode: "USD",
          occurredAt: "2026-02-01T00:00:00.000Z",
          description: "Top up",
          purpose: "fixed-deposit-top-up"
        });

        await repo.update(topUpTransferId, {
          sourceAccountId: fundingAccount.id,
          sourceFixedDepositId: null,
          sourceAmountMinor: 5_000,
          sourceCurrencyCode: "USD",
          destinationAccountId: null,
          destinationFixedDepositId: fixedDepositId,
          destinationAmountMinor: 5_000,
          destinationCurrencyCode: "USD",
          occurredAt: "2026-02-01T00:00:00.000Z",
          description: "Corrected top up",
          purpose: "fixed-deposit-top-up"
        });

        const afterUpdate = await new PgFixedDepositRepository(CONNECTION_STRING, ownerId).getById(
          fixedDepositId
        );
        expect(afterUpdate?.principalMinor).toBe(15_000);
      } finally {
        await cleanup({
          transactionIds: [`${topUpTransferId}-source`],
          transferIds: [topUpTransferId],
          fixedDepositIds: [fixedDepositId],
          accountIds: [fundingAccount.id, unusedAccount.id],
          institutionIds: [institution.id]
        });
      }
    });

    it("throws on an unknown transfer id", async () => {
      const ownerId = randomUUID();
      const repo = new PgTransferRepository(CONNECTION_STRING, ownerId);

      await expect(
        repo.update(randomUUID(), {
          sourceAccountId: randomUUID(),
          sourceFixedDepositId: null,
          sourceAmountMinor: 1000,
          sourceCurrencyCode: "USD",
          destinationAccountId: randomUUID(),
          destinationFixedDepositId: null,
          destinationAmountMinor: 1000,
          destinationCurrencyCode: "USD",
          occurredAt: "2026-01-01T00:00:00.000Z",
          description: "Unknown",
          purpose: "general"
        })
      ).rejects.toBeInstanceOf(TransferNotFoundError);
    });

    it("does not update another Owner's Transfer", async () => {
      const ownerA = randomUUID();
      const ownerB = randomUUID();
      const { institution, accountA, accountB } = await seedOwnerWithTwoAccounts(ownerA);
      const transferId = randomUUID();

      try {
        const repoA = new PgTransferRepository(CONNECTION_STRING, ownerA);
        const repoB = new PgTransferRepository(CONNECTION_STRING, ownerB);
        await repoA.create({
          id: transferId,
          sourceAccountId: accountA.id,
          sourceFixedDepositId: null,
          sourceAmountMinor: 5000,
          sourceCurrencyCode: "USD",
          destinationAccountId: accountB.id,
          destinationFixedDepositId: null,
          destinationAmountMinor: 5000,
          destinationCurrencyCode: "USD",
          occurredAt: "2026-01-01T00:00:00.000Z",
          description: "Owner A transfer",
          purpose: "general"
        });

        await expect(
          repoB.update(transferId, {
            sourceAccountId: accountA.id,
            sourceFixedDepositId: null,
            sourceAmountMinor: 9000,
            sourceCurrencyCode: "USD",
            destinationAccountId: accountB.id,
            destinationFixedDepositId: null,
            destinationAmountMinor: 9000,
            destinationCurrencyCode: "USD",
            occurredAt: "2026-01-01T00:00:00.000Z",
            description: "Changed by B",
            purpose: "general"
          })
        ).rejects.toBeInstanceOf(TransferNotFoundError);

        expect((await repoA.getById(transferId))?.description).toBe("Owner A transfer");
      } finally {
        await cleanup({
          transactionIds: [`${transferId}-source`, `${transferId}-destination`],
          transferIds: [transferId],
          accountIds: [accountA.id, accountB.id],
          institutionIds: [institution.id]
        });
      }
    });
  });
});
