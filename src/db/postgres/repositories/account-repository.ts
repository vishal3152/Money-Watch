import { and, asc, count, eq, gte, or } from "drizzle-orm";

import type { Account } from "@/domain/account";
import { AccountHardDeleteBlockedError, AccountNotFoundError, EntityHasDependentsError } from "@/db/errors";
import { getScopedDb } from "@/db/postgres/scoped-db";
import {
  accounts,
  adjustments,
  balanceSnapshots,
  discrepancies,
  fixedDeposits,
  importBatches,
  reconciliations,
  transactions,
  transfers
} from "@/db/postgres/schema";
import type {
  AccountDependentCounts,
  AccountRepositoryPort,
  AccountUpdateInput
} from "@/db/repositories/ports";

export class PgAccountRepository implements AccountRepositoryPort {
  constructor(
    private readonly connectionString: string,
    private readonly ownerId: string
  ) {}

  async create(input: Account): Promise<Account> {
    const db = getScopedDb(this.connectionString);

    await db.insert(accounts).values({
      id: input.id,
      ownerId: this.ownerId,
      institutionId: input.institutionId,
      name: input.name,
      accountNumber: input.accountNumber,
      currencyCode: input.currencyCode
    });

    return input;
  }

  async getById(accountId: string): Promise<Account | null> {
    const db = getScopedDb(this.connectionString);

    const rows = await db
      .select()
      .from(accounts)
      .where(and(eq(accounts.id, accountId), eq(accounts.ownerId, this.ownerId)));

    const row = rows[0];
    if (!row) {
      return null;
    }

    return {
      id: row.id,
      institutionId: row.institutionId,
      name: row.name,
      accountNumber: row.accountNumber ?? null,
      currencyCode: row.currencyCode
    };
  }

  async listAll(): Promise<Account[]> {
    const db = getScopedDb(this.connectionString);

    const rows = await db
      .select()
      .from(accounts)
      .where(eq(accounts.ownerId, this.ownerId))
      .orderBy(asc(accounts.id));

    return rows.map((row) => ({
      id: row.id,
      institutionId: row.institutionId,
      name: row.name,
      accountNumber: row.accountNumber ?? null,
      currencyCode: row.currencyCode
    }));
  }

  async listByInstitutionId(institutionId: string): Promise<Account[]> {
    const db = getScopedDb(this.connectionString);

    const rows = await db
      .select()
      .from(accounts)
      .where(and(eq(accounts.institutionId, institutionId), eq(accounts.ownerId, this.ownerId)))
      .orderBy(asc(accounts.id));

    return rows.map((row) => ({
      id: row.id,
      institutionId: row.institutionId,
      name: row.name,
      accountNumber: row.accountNumber ?? null,
      currencyCode: row.currencyCode
    }));
  }

  async update(accountId: string, fields: AccountUpdateInput): Promise<Account> {
    const existing = await this.getById(accountId);

    if (!existing) {
      throw new AccountNotFoundError(accountId);
    }

    const name = fields.name ?? existing.name;
    const accountNumber = fields.accountNumber !== undefined ? fields.accountNumber : existing.accountNumber;
    const db = getScopedDb(this.connectionString);

    await db
      .update(accounts)
      .set({ name, accountNumber })
      .where(and(eq(accounts.id, accountId), eq(accounts.ownerId, this.ownerId)));

    return { ...existing, name, accountNumber };
  }

  async getDependentCounts(accountId: string): Promise<AccountDependentCounts> {
    const db = getScopedDb(this.connectionString);

    return countDependents(db, accountId, this.ownerId);
  }

  async delete(accountId: string): Promise<void> {
    const db = getScopedDb(this.connectionString);

    await db.transaction(async (tx) => {
      const dependents = await countDependents(tx, accountId, this.ownerId);

      const parts: string[] = [];
      if (dependents.transactions > 0) {
        parts.push(`${dependents.transactions} Transaction${dependents.transactions === 1 ? "" : "s"}`);
      }
      if (dependents.reconciliations > 0) {
        parts.push(
          `${dependents.reconciliations} Reconciliation${dependents.reconciliations === 1 ? "" : "s"}`
        );
      }
      if (dependents.fixedDeposits > 0) {
        parts.push(
          `${dependents.fixedDeposits} Fixed Deposit${dependents.fixedDeposits === 1 ? "" : "s"}`
        );
      }

      if (parts.length > 0) {
        throw new EntityHasDependentsError(`This Account still has ${parts.join(", ")}. Delete those first.`);
      }

      await tx.delete(accounts).where(and(eq(accounts.id, accountId), eq(accounts.ownerId, this.ownerId)));
    });
  }

  async hardDelete(accountId: string): Promise<void> {
    const db = getScopedDb(this.connectionString);

    const dependents = await countDependents(db, accountId, this.ownerId);
    if (dependents.fixedDeposits > 0) {
      throw new EntityHasDependentsError(
        `This Account still has ${dependents.fixedDeposits} Fixed Deposit${dependents.fixedDeposits === 1 ? "" : "s"} linked to it. Delete ${dependents.fixedDeposits === 1 ? "it" : "those"} first.`
      );
    }

    await this.assertNoAccountHasReconciledOurTransfers(db, accountId);

    await db.transaction(async (tx) => {
      const relatedReconciliations = await tx
        .select({ id: reconciliations.id })
        .from(reconciliations)
        .where(and(eq(reconciliations.accountId, accountId), eq(reconciliations.ownerId, this.ownerId)));

      for (const reconciliation of relatedReconciliations) {
        const relatedDiscrepancies = await tx
          .select({ id: discrepancies.id })
          .from(discrepancies)
          .where(
            and(eq(discrepancies.reconciliationId, reconciliation.id), eq(discrepancies.ownerId, this.ownerId))
          );

        for (const discrepancy of relatedDiscrepancies) {
          await tx
            .delete(adjustments)
            .where(and(eq(adjustments.discrepancyId, discrepancy.id), eq(adjustments.ownerId, this.ownerId)));
        }

        await tx
          .delete(discrepancies)
          .where(
            and(eq(discrepancies.reconciliationId, reconciliation.id), eq(discrepancies.ownerId, this.ownerId))
          );
      }

      const relatedTransfers = await tx
        .select({ id: transfers.id })
        .from(transfers)
        .where(
          and(
            or(eq(transfers.sourceAccountId, accountId), eq(transfers.destinationAccountId, accountId)),
            eq(transfers.ownerId, this.ownerId)
          )
        );

      for (const transfer of relatedTransfers) {
        await tx
          .delete(transactions)
          .where(and(eq(transactions.transferId, transfer.id), eq(transactions.ownerId, this.ownerId)));
        await tx.delete(transfers).where(and(eq(transfers.id, transfer.id), eq(transfers.ownerId, this.ownerId)));
      }

      await tx
        .delete(transactions)
        .where(and(eq(transactions.accountId, accountId), eq(transactions.ownerId, this.ownerId)));
      await tx
        .delete(importBatches)
        .where(and(eq(importBatches.accountId, accountId), eq(importBatches.ownerId, this.ownerId)));
      await tx
        .delete(reconciliations)
        .where(and(eq(reconciliations.accountId, accountId), eq(reconciliations.ownerId, this.ownerId)));
      await tx
        .delete(balanceSnapshots)
        .where(and(eq(balanceSnapshots.accountId, accountId), eq(balanceSnapshots.ownerId, this.ownerId)));
      await tx.delete(accounts).where(and(eq(accounts.id, accountId), eq(accounts.ownerId, this.ownerId)));
    });
  }

  // See the SQLite AccountRepository's identical guard for the reasoning: an Account's Transfer
  // gets fully removed on hardDelete, so the other leg's Account must not already have a
  // Reconciliation whose snapshot covers that Transfer's date.
  private async assertNoAccountHasReconciledOurTransfers(
    db: ReturnType<typeof getScopedDb>,
    accountId: string
  ): Promise<void> {
    const relatedTransfers = await db
      .select()
      .from(transfers)
      .where(
        and(
          or(eq(transfers.sourceAccountId, accountId), eq(transfers.destinationAccountId, accountId)),
          eq(transfers.ownerId, this.ownerId)
        )
      );

    for (const transfer of relatedTransfers) {
      const otherAccountId =
        transfer.sourceAccountId === accountId ? transfer.destinationAccountId : transfer.sourceAccountId;
      if (!otherAccountId) {
        continue;
      }

      const transferDate = transfer.occurredAt.slice(0, 10);
      const blockingReconciliation = await db
        .select({ id: reconciliations.id })
        .from(reconciliations)
        .innerJoin(
          balanceSnapshots,
          and(eq(balanceSnapshots.id, reconciliations.balanceSnapshotId), eq(balanceSnapshots.ownerId, this.ownerId))
        )
        .where(
          and(
            eq(reconciliations.accountId, otherAccountId),
            eq(reconciliations.ownerId, this.ownerId),
            gte(balanceSnapshots.asOfDate, transferDate)
          )
        )
        .limit(1);

      if (blockingReconciliation.length > 0) {
        const otherAccount = await this.getById(otherAccountId);
        throw new AccountHardDeleteBlockedError(
          `Account "${otherAccount?.name ?? otherAccountId}" has already reconciled a period covering a Transfer with this Account. Resolve that first.`
        );
      }
    }
  }
}

// Counts only -- selecting full rows to read `.length` would ship every
// dependent Transaction/Reconciliation/FixedDeposit row over the wire just
// to discard it.
async function countDependents(
  db: Pick<ReturnType<typeof getScopedDb>, "select">,
  accountId: string,
  ownerId: string
): Promise<AccountDependentCounts> {
  const [[transactionCount], [reconciliationCount], [fixedDepositCount]] = await Promise.all([
    db
      .select({ value: count() })
      .from(transactions)
      .where(and(eq(transactions.accountId, accountId), eq(transactions.ownerId, ownerId))),
    db
      .select({ value: count() })
      .from(reconciliations)
      .where(and(eq(reconciliations.accountId, accountId), eq(reconciliations.ownerId, ownerId))),
    db
      .select({ value: count() })
      .from(fixedDeposits)
      .where(and(eq(fixedDeposits.linkedAccountId, accountId), eq(fixedDeposits.ownerId, ownerId)))
  ]);

  return {
    transactions: transactionCount.value,
    reconciliations: reconciliationCount.value,
    fixedDeposits: fixedDepositCount.value
  };
}
