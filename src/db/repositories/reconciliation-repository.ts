import { and, asc, count, eq, inArray, isNull } from "drizzle-orm";

import type { DrizzleDb } from "@/db/client";
import type { Adjustment } from "@/domain/adjustment";
import type { Discrepancy, DiscrepancyResolution } from "@/domain/discrepancy";
import type { Reconciliation } from "@/domain/reconciliation";
import { computeAccountBalanceAsOf } from "@/domain/account-balance";
import {
  BalanceSnapshotNotFoundError,
  DiscrepancyAlreadyResolvedError,
  DiscrepancyNotFoundError,
  runDatabaseWrite
} from "@/db/errors";
import {
  adjustments,
  balanceSnapshots,
  discrepancies,
  reconciliations,
  transactions as transactionRows
} from "@/db/schema";
import { assertMinorUnits } from "@/domain/money";
import { normalizeTransactionTimestamp } from "@/domain/transaction";
import { TransactionRepository } from "@/db/repositories/transaction-repository";
import type {
  AccountOpenDiscrepancyCount,
  AdjustmentLink,
  CreateAdjustmentTransactionInput,
  CreateReconciliationInput,
  ReconciliationRepositoryPort
} from "@/db/repositories/ports";

export class ReconciliationRepository implements ReconciliationRepositoryPort {
  constructor(private readonly db: DrizzleDb) {}

  async create(input: CreateReconciliationInput): Promise<Reconciliation> {
    const snapshot = await this.db.query.balanceSnapshots.findFirst({
      where: eq(balanceSnapshots.id, input.balanceSnapshotId)
    });

    if (!snapshot) {
      throw new BalanceSnapshotNotFoundError(input.balanceSnapshotId);
    }

    const transactionRepository = new TransactionRepository(this.db);
    const transactions = await transactionRepository.listByAccountId(input.accountId);
    const computedBalanceMinor = computeAccountBalanceAsOf(transactions, snapshot.asOfDate);

    const reconciliation: Reconciliation = {
      id: input.id,
      accountId: input.accountId,
      balanceSnapshotId: input.balanceSnapshotId,
      computedBalanceMinor,
      reconciledAt: normalizeTransactionTimestamp(input.reconciledAt)
    };

    await runDatabaseWrite(async () =>
      this.db.transaction((tx) => {
        tx.insert(reconciliations)
          .values({
            id: reconciliation.id,
            accountId: reconciliation.accountId,
            balanceSnapshotId: reconciliation.balanceSnapshotId,
            computedBalanceMinor: reconciliation.computedBalanceMinor,
            reconciledAt: reconciliation.reconciledAt
          })
          .run();

        if (computedBalanceMinor !== snapshot.balanceMinor) {
          tx.insert(discrepancies)
            .values({
              id: `${reconciliation.id}-discrepancy`,
              reconciliationId: reconciliation.id,
              amountMinor: snapshot.balanceMinor - computedBalanceMinor,
              resolution: null
            })
            .run();
        }
      })
    );

    return reconciliation;
  }

  async getById(reconciliationId: string): Promise<Reconciliation | null> {
    const row = await this.db.query.reconciliations.findFirst({
      where: eq(reconciliations.id, reconciliationId)
    });

    if (!row) {
      return null;
    }

    return {
      id: row.id,
      accountId: row.accountId,
      balanceSnapshotId: row.balanceSnapshotId,
      computedBalanceMinor: row.computedBalanceMinor,
      reconciledAt: row.reconciledAt
    };
  }

  async listByAccountId(accountId: string): Promise<Reconciliation[]> {
    const rows = await this.db.query.reconciliations.findMany({
      where: eq(reconciliations.accountId, accountId),
      orderBy: [asc(reconciliations.reconciledAt), asc(reconciliations.id)]
    });

    return rows.map((row) => ({
      id: row.id,
      accountId: row.accountId,
      balanceSnapshotId: row.balanceSnapshotId,
      computedBalanceMinor: row.computedBalanceMinor,
      reconciledAt: row.reconciledAt
    }));
  }

  async countOpenDiscrepanciesByAccountIds(
    accountIds: string[]
  ): Promise<AccountOpenDiscrepancyCount[]> {
    if (accountIds.length === 0) {
      return [];
    }

    const rows = await this.db
      .select({
        accountId: reconciliations.accountId,
        openDiscrepancies: count(discrepancies.id)
      })
      .from(reconciliations)
      .innerJoin(discrepancies, eq(discrepancies.reconciliationId, reconciliations.id))
      .where(and(inArray(reconciliations.accountId, accountIds), isNull(discrepancies.resolution)))
      .groupBy(reconciliations.accountId);

    return rows.map((row) => ({
      accountId: row.accountId,
      openDiscrepancies: row.openDiscrepancies
    }));
  }

  async getDiscrepancyByReconciliationId(reconciliationId: string): Promise<Discrepancy | null> {
    const row = await this.db.query.discrepancies.findFirst({
      where: eq(discrepancies.reconciliationId, reconciliationId)
    });

    if (!row) {
      return null;
    }

    return {
      id: row.id,
      reconciliationId: row.reconciliationId,
      amountMinor: row.amountMinor,
      resolution: row.resolution
    };
  }

  async listDiscrepanciesByReconciliationIds(reconciliationIds: string[]): Promise<Discrepancy[]> {
    if (reconciliationIds.length === 0) {
      return [];
    }

    const rows = await this.db.query.discrepancies.findMany({
      where: inArray(discrepancies.reconciliationId, reconciliationIds)
    });

    return rows.map((row) => ({
      id: row.id,
      reconciliationId: row.reconciliationId,
      amountMinor: row.amountMinor,
      resolution: row.resolution
    }));
  }

  async listAdjustmentLinksByAccountId(accountId: string): Promise<AdjustmentLink[]> {
    return this.db
      .select({
        transactionId: adjustments.transactionId,
        reconciliationId: discrepancies.reconciliationId
      })
      .from(adjustments)
      .innerJoin(discrepancies, eq(discrepancies.id, adjustments.discrepancyId))
      .innerJoin(reconciliations, eq(reconciliations.id, discrepancies.reconciliationId))
      .where(eq(reconciliations.accountId, accountId));
  }

  async resolveDiscrepancy(discrepancyId: string, resolution: DiscrepancyResolution): Promise<Discrepancy> {
    const existing = await this.db.query.discrepancies.findFirst({
      where: eq(discrepancies.id, discrepancyId)
    });

    if (!existing) {
      throw new DiscrepancyNotFoundError(discrepancyId);
    }

    await runDatabaseWrite(async () => {
      // Two concurrent resolve submissions (a double-click, or a back-button resubmit) can both
      // read resolution === null before either writes — the Server Action layer already guards
      // against the sequential case, but this conditional update is the atomic gate against the
      // race: WHERE resolution IS NULL means only the first writer's update actually changes a
      // row, and a 0-row result tells the loser it lost, instead of silently overwriting.
      const result = this.db
        .update(discrepancies)
        .set({ resolution })
        .where(and(eq(discrepancies.id, discrepancyId), isNull(discrepancies.resolution)))
        .run();
      if (result.changes === 0) {
        throw new DiscrepancyAlreadyResolvedError();
      }
    });

    const row = await this.db.query.discrepancies.findFirst({
      where: eq(discrepancies.id, discrepancyId)
    });

    if (!row) {
      throw new DiscrepancyNotFoundError(discrepancyId);
    }

    return {
      id: row.id,
      reconciliationId: row.reconciliationId,
      amountMinor: row.amountMinor,
      resolution: row.resolution
    };
  }

  async resolveWithAdjustment(
    discrepancyId: string,
    transaction: CreateAdjustmentTransactionInput
  ): Promise<Adjustment> {
    assertMinorUnits(transaction.amountMinor);

    const existing = await this.db.query.discrepancies.findFirst({
      where: eq(discrepancies.id, discrepancyId)
    });

    if (!existing) {
      throw new DiscrepancyNotFoundError(discrepancyId);
    }

    const occurredAt = normalizeTransactionTimestamp(transaction.occurredAt);
    const adjustment: Adjustment = {
      id: `${transaction.id}-adjustment`,
      transactionId: transaction.id,
      discrepancyId
    };

    await runDatabaseWrite(async () =>
      this.db.transaction((tx) => {
        // The same race as resolveDiscrepancy's, and much more costly here: without this
        // conditional-update gate, two concurrent calls both insert their own Adjustment
        // Transaction against the same Discrepancy — adjustments.discrepancy_id carries no
        // unique constraint — silently doubling the ledger correction. Run this first so a lost
        // race throws before any Transaction/Adjustment row is inserted, and the transaction
        // rolls back cleanly.
        const result = tx
          .update(discrepancies)
          .set({ resolution: "corrected-my-record" })
          .where(and(eq(discrepancies.id, discrepancyId), isNull(discrepancies.resolution)))
          .run();
        if (result.changes === 0) {
          throw new DiscrepancyAlreadyResolvedError();
        }

        tx.insert(transactionRows)
          .values({
            id: transaction.id,
            accountId: transaction.accountId,
            amountMinor: transaction.amountMinor,
            occurredAt,
            description: transaction.description,
            trustStatus: "Confirmed",
            transferId: null
          })
          .run();
        tx.insert(adjustments).values(adjustment).run();
      })
    );

    return adjustment;
  }
}
