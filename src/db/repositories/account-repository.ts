import { and, asc, eq, gte, or } from "drizzle-orm";

import type { Account } from "@/domain/account";
import type { DrizzleDb } from "@/db/client";
import {
  AccountHardDeleteBlockedError,
  AccountNotFoundError,
  EntityHasDependentsError,
  runDatabaseWrite
} from "@/db/errors";
import type { AccountRepositoryPort, AccountUpdateInput } from "@/db/repositories/ports";
import {
  accounts,
  balanceSnapshots,
  fixedDeposits,
  importBatches,
  reconciliations,
  transactions,
  transfers
} from "@/db/schema";

export type AccountDependentCounts = {
  transactions: number;
  reconciliations: number;
  fixedDeposits: number;
};

export class AccountRepository implements AccountRepositoryPort {
  constructor(private readonly db: DrizzleDb) {}

  async create(input: Account): Promise<Account> {
    await runDatabaseWrite(() =>
      this.db.insert(accounts).values({
        id: input.id,
        institutionId: input.institutionId,
        name: input.name,
        accountNumber: input.accountNumber,
        currencyCode: input.currencyCode
      })
    );

    return input;
  }

  async getById(accountId: string): Promise<Account | null> {
    const row = await this.db.query.accounts.findFirst({
      where: eq(accounts.id, accountId)
    });

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
    const rows = await this.db.query.accounts.findMany({
      orderBy: [asc(accounts.id)]
    });

    return rows.map((row) => ({
      id: row.id,
      institutionId: row.institutionId,
      name: row.name,
      accountNumber: row.accountNumber ?? null,
      currencyCode: row.currencyCode
    }));
  }

  async listByInstitutionId(institutionId: string): Promise<Account[]> {
    const rows = await this.db.query.accounts.findMany({
      where: eq(accounts.institutionId, institutionId),
      orderBy: [asc(accounts.id)]
    });

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

    await runDatabaseWrite(() =>
      this.db.update(accounts).set({ name, accountNumber }).where(eq(accounts.id, accountId))
    );

    return { ...existing, name, accountNumber };
  }

  async getDependentCounts(accountId: string): Promise<AccountDependentCounts> {
    const [transactionRows, reconciliationRows, fixedDepositRows] = await Promise.all([
      this.db.query.transactions.findMany({ where: eq(transactions.accountId, accountId) }),
      this.db.query.reconciliations.findMany({ where: eq(reconciliations.accountId, accountId) }),
      this.db.query.fixedDeposits.findMany({ where: eq(fixedDeposits.linkedAccountId, accountId) })
    ]);

    return {
      transactions: transactionRows.length,
      reconciliations: reconciliationRows.length,
      fixedDeposits: fixedDepositRows.length
    };
  }

  async delete(accountId: string): Promise<void> {
    const dependents = await this.getDependentCounts(accountId);
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
      throw new EntityHasDependentsError(
        `This Account still has ${parts.join(", ")}. Delete those first.`
      );
    }

    await runDatabaseWrite(() => this.db.delete(accounts).where(eq(accounts.id, accountId)));
  }

  async hardDelete(accountId: string): Promise<void> {
    const dependents = await this.getDependentCounts(accountId);
    if (dependents.fixedDeposits > 0) {
      throw new EntityHasDependentsError(
        `This Account still has ${dependents.fixedDeposits} Fixed Deposit${dependents.fixedDeposits === 1 ? "" : "s"} linked to it. Delete ${dependents.fixedDeposits === 1 ? "it" : "those"} first.`
      );
    }

    await this.assertNoAccountHasReconciledOurTransfers(accountId);

    await runDatabaseWrite(async () =>
      this.db.transaction((tx) => {
        tx.delete(transfers)
          .where(or(eq(transfers.sourceAccountId, accountId), eq(transfers.destinationAccountId, accountId)))
          .run();
        tx.delete(transactions).where(eq(transactions.accountId, accountId)).run();
        tx.delete(importBatches).where(eq(importBatches.accountId, accountId)).run();
        tx.delete(reconciliations).where(eq(reconciliations.accountId, accountId)).run();
        tx.delete(balanceSnapshots).where(eq(balanceSnapshots.accountId, accountId)).run();
        tx.delete(accounts).where(eq(accounts.id, accountId)).run();
      })
    );
  }

  // A Transfer's other leg keeps its linked Transaction only until this Account is deleted, at
  // which point the whole Transfer (both legs) is removed. If that other Account has already
  // reconciled a period covering the Transfer's date, its Reconciliation's computed balance
  // already counts a Transaction that's about to vanish — block instead of silently going stale.
  private async assertNoAccountHasReconciledOurTransfers(accountId: string): Promise<void> {
    const relatedTransfers = await this.db.query.transfers.findMany({
      where: or(eq(transfers.sourceAccountId, accountId), eq(transfers.destinationAccountId, accountId))
    });

    for (const transfer of relatedTransfers) {
      const otherAccountId =
        transfer.sourceAccountId === accountId ? transfer.destinationAccountId : transfer.sourceAccountId;
      if (!otherAccountId) {
        continue;
      }

      const transferDate = transfer.occurredAt.slice(0, 10);
      const blockingReconciliation = await this.db
        .select({ id: reconciliations.id })
        .from(reconciliations)
        .innerJoin(balanceSnapshots, eq(balanceSnapshots.id, reconciliations.balanceSnapshotId))
        .where(and(eq(reconciliations.accountId, otherAccountId), gte(balanceSnapshots.asOfDate, transferDate)))
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
