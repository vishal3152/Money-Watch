import { and, desc, eq, gt, isNotNull } from "drizzle-orm";

import {
  DatabaseConstraintError,
  hasPostgresErrorCode,
  ImportBatchAlreadyConfirmedError,
  ImportBatchHasUnresolvedDuplicatesError,
  ImportBatchNotConfirmedError,
  ImportBatchNotFoundError,
  ImportBatchUndoBlockedError
} from "@/db/errors";
import { PgAccountRepository } from "@/db/postgres/repositories/account-repository";
import { PgAdjustmentRepository } from "@/db/postgres/repositories/adjustment-repository";
import { PgBalanceSnapshotRepository } from "@/db/postgres/repositories/balance-snapshot-repository";
import { PgReconciliationRepository } from "@/db/postgres/repositories/reconciliation-repository";
import { getScopedDb } from "@/db/postgres/scoped-db";
import { balanceSnapshots, discrepancies, importBatches, reconciliations, transactions } from "@/db/postgres/schema";
import type {
  CreateImportBatchInput,
  ImportBatchRepositoryPort,
  ImportBatchTransactionInput
} from "@/db/repositories/ports";
import { assertValidCalendarDate } from "@/domain/calendar-date";
import { parseDecimalToMinorUnits } from "@/domain/decimal-input";
import { assertValidClosingBalance, EmptyImportBatchError, type ImportBatch } from "@/domain/import-batch";
import { normalizeTransactionTimestamp } from "@/domain/transaction";

function rowToImportBatch(row: typeof importBatches.$inferSelect): ImportBatch {
  return {
    id: row.id,
    accountId: row.accountId,
    source: row.source,
    createdAt: row.createdAt,
    closingBalanceMinor: row.closingBalanceMinor,
    asOfDate: row.asOfDate,
    confirmedAt: row.confirmedAt,
    balanceSnapshotId: row.balanceSnapshotId,
    reconciliationId: row.reconciliationId
  };
}

export class PgImportBatchRepository implements ImportBatchRepositoryPort {
  constructor(
    private readonly connectionString: string,
    private readonly ownerId: string
  ) {}

  async create(
    input: CreateImportBatchInput,
    lineItems: ImportBatchTransactionInput[]
  ): Promise<ImportBatch> {
    if (lineItems.length === 0) {
      throw new EmptyImportBatchError();
    }

    assertValidClosingBalance(input.closingBalance, input.asOfDate);
    if (input.asOfDate !== null) {
      assertValidCalendarDate(input.asOfDate);
    }
    for (const lineItem of lineItems) {
      assertValidCalendarDate(lineItem.occurredAt);
    }

    const account = await new PgAccountRepository(this.connectionString, this.ownerId).getById(input.accountId);
    if (!account) {
      throw new DatabaseConstraintError(new Error(`Account ${input.accountId} does not exist.`));
    }

    const closingBalanceMinor =
      input.closingBalance !== null ? parseDecimalToMinorUnits(input.closingBalance, account.currencyCode) : null;

    const db = getScopedDb(this.connectionString);

    // Suspected Duplicate matching (CONTEXT.md) — mirrors ImportBatchRepository (SQLite): existing
    // rows are earliest-first (a manually-entered Transaction has no ImportBatch and is always
    // treated as the presumed original; among imported rows, the earlier ImportBatch wins), so the
    // map is seeded with the earliest match per key and never overwritten — a later line item in
    // *this* batch that repeats an earlier one then also lands on the first occurrence via the same
    // map, since nothing outranks an already-set key.
    const existingRows = await db
      .select({
        id: transactions.id,
        occurredAt: transactions.occurredAt,
        amountMinor: transactions.amountMinor,
        externalRef: transactions.externalRef,
        importBatchCreatedAt: importBatches.createdAt
      })
      .from(transactions)
      .leftJoin(importBatches, eq(transactions.importBatchId, importBatches.id))
      .where(and(eq(transactions.accountId, input.accountId), eq(transactions.ownerId, this.ownerId)));
    existingRows.sort((a, b) => {
      const aKey = a.importBatchCreatedAt ?? "";
      const bKey = b.importBatchCreatedAt ?? "";
      return aKey === bKey ? a.id.localeCompare(b.id) : aKey.localeCompare(bKey);
    });
    // Two independent lookups: a ref-numbered line only ever matches another row that also has a
    // ref (preferred, since a ref is a stronger signal), falling back to date+amount when no ref
    // match is found — never the reverse.
    const matchingTransactionIdByKey = new Map<string, string>();
    const matchingTransactionIdByExternalRef = new Map<string, string>();
    for (const existing of existingRows) {
      const key = `${existing.occurredAt.slice(0, 10)}|${existing.amountMinor}`;
      if (!matchingTransactionIdByKey.has(key)) {
        matchingTransactionIdByKey.set(key, existing.id);
      }
      if (existing.externalRef !== null && !matchingTransactionIdByExternalRef.has(existing.externalRef)) {
        matchingTransactionIdByExternalRef.set(existing.externalRef, existing.id);
      }
    }

    const parsedLineItems = lineItems.map((lineItem) => {
      const amountMinor = parseDecimalToMinorUnits(lineItem.amount, account.currencyCode);
      const key = `${lineItem.occurredAt}|${amountMinor}`;
      const externalRef = lineItem.externalRef ?? null;
      const possibleDuplicateOfTransactionId =
        (externalRef !== null ? matchingTransactionIdByExternalRef.get(externalRef) : undefined) ??
        matchingTransactionIdByKey.get(key) ??
        null;
      if (!matchingTransactionIdByKey.has(key)) {
        matchingTransactionIdByKey.set(key, lineItem.id);
      }
      if (externalRef !== null && !matchingTransactionIdByExternalRef.has(externalRef)) {
        matchingTransactionIdByExternalRef.set(externalRef, lineItem.id);
      }
      return { ...lineItem, amountMinor, externalRef, possibleDuplicateOfTransactionId };
    });

    const batch: ImportBatch = {
      id: input.id,
      accountId: input.accountId,
      source: input.source,
      createdAt: normalizeTransactionTimestamp(input.createdAt),
      closingBalanceMinor,
      asOfDate: input.asOfDate,
      confirmedAt: null,
      balanceSnapshotId: null,
      reconciliationId: null
    };

    try {
      await db.transaction(async (tx) => {
        await tx.insert(importBatches).values({
          id: batch.id,
          ownerId: this.ownerId,
          accountId: batch.accountId,
          source: batch.source,
          createdAt: batch.createdAt,
          closingBalanceMinor: batch.closingBalanceMinor,
          asOfDate: batch.asOfDate,
          confirmedAt: null,
          balanceSnapshotId: null,
          reconciliationId: null
        });

        for (const lineItem of parsedLineItems) {
          await tx.insert(transactions).values({
            id: lineItem.id,
            ownerId: this.ownerId,
            accountId: batch.accountId,
            amountMinor: lineItem.amountMinor,
            occurredAt: `${lineItem.occurredAt}T00:00:00.000Z`,
            description: lineItem.description,
            trustStatus: "Imported",
            transferId: null,
            category: lineItem.category,
            importBatchId: batch.id,
            externalRef: lineItem.externalRef,
            possibleDuplicateOfTransactionId: lineItem.possibleDuplicateOfTransactionId
          });
        }
      });
    } catch (error) {
      throw new DatabaseConstraintError(error);
    }

    return batch;
  }

  async getById(id: string): Promise<ImportBatch | null> {
    const db = getScopedDb(this.connectionString);

    const rows = await db
      .select()
      .from(importBatches)
      .where(and(eq(importBatches.id, id), eq(importBatches.ownerId, this.ownerId)));

    const row = rows[0];
    return row ? rowToImportBatch(row) : null;
  }

  /** Most recent first (`docs/specs/import.md`), for the `/imports` review list. */
  async listAll(): Promise<ImportBatch[]> {
    const db = getScopedDb(this.connectionString);

    const rows = await db
      .select()
      .from(importBatches)
      .where(eq(importBatches.ownerId, this.ownerId))
      .orderBy(desc(importBatches.createdAt));

    return rows.map(rowToImportBatch);
  }

  // Deliberately not one atomic write, matching ImportBatchRepository.confirmAll() (SQLite) and
  // docs/specs/import.md's persistence requirements: the trust-status flip is its own atomic
  // step, then BalanceSnapshot/Reconciliation are created via the existing repositories rather
  // than a parallel reimplementation of the Discrepancy rule.
  async confirmAll(id: string): Promise<ImportBatch> {
    const existing = await this.getById(id);
    if (!existing) {
      throw new ImportBatchNotFoundError(id);
    }
    if (existing.confirmedAt !== null) {
      throw new ImportBatchAlreadyConfirmedError();
    }

    const db = getScopedDb(this.connectionString);

    const unresolvedDuplicates = await db
      .select({ id: transactions.id })
      .from(transactions)
      .where(
        and(
          eq(transactions.importBatchId, id),
          eq(transactions.ownerId, this.ownerId),
          isNotNull(transactions.possibleDuplicateOfTransactionId)
        )
      )
      .limit(1);
    if (unresolvedDuplicates.length > 0) {
      throw new ImportBatchHasUnresolvedDuplicatesError();
    }

    await db
      .update(transactions)
      .set({ trustStatus: "Confirmed" })
      .where(and(eq(transactions.importBatchId, id), eq(transactions.ownerId, this.ownerId)));

    let balanceSnapshotId: string | null = null;
    let reconciliationId: string | null = null;
    const now = new Date().toISOString();

    if (existing.closingBalanceMinor !== null && existing.asOfDate !== null) {
      balanceSnapshotId = `${id}-snapshot`;
      reconciliationId = `${id}-reconciliation`;

      try {
        await new PgBalanceSnapshotRepository(this.connectionString, this.ownerId).create({
          id: balanceSnapshotId,
          accountId: existing.accountId,
          asOfDate: existing.asOfDate,
          balanceMinor: existing.closingBalanceMinor
        });

        await new PgReconciliationRepository(this.connectionString, this.ownerId).create({
          id: reconciliationId,
          accountId: existing.accountId,
          balanceSnapshotId,
          reconciledAt: now
        });
      } catch (error) {
        // See the SQLite ImportBatchRepository's identical comment: two concurrent confirmAll
        // calls can both read confirmedAt === null before either writes. The loser hits a
        // duplicate deterministic snapshot/reconciliation id — Postgres's unique_violation
        // SQLSTATE code 23505 — and its winner may not have finished writing confirmedAt yet,
        // so re-checking the batch's state here would be unreliable.
        if (hasPostgresErrorCode(error, "23505")) {
          throw new ImportBatchAlreadyConfirmedError();
        }
        throw error;
      }
    }

    await db
      .update(importBatches)
      .set({ confirmedAt: now, balanceSnapshotId, reconciliationId })
      .where(and(eq(importBatches.id, id), eq(importBatches.ownerId, this.ownerId)));

    return { ...existing, confirmedAt: now, balanceSnapshotId, reconciliationId };
  }

  async undoConfirmed(id: string): Promise<void> {
    const existing = await this.getById(id);
    if (!existing) {
      throw new ImportBatchNotFoundError(id);
    }
    if (existing.confirmedAt === null) {
      throw new ImportBatchNotConfirmedError();
    }

    if (existing.reconciliationId !== null) {
      const reconciliationRepository = new PgReconciliationRepository(this.connectionString, this.ownerId);
      const discrepancy = await reconciliationRepository.getDiscrepancyByReconciliationId(existing.reconciliationId);
      if (discrepancy) {
        const adjustment = await new PgAdjustmentRepository(this.connectionString, this.ownerId).getByDiscrepancyId(
          discrepancy.id
        );
        if (adjustment) {
          throw new ImportBatchUndoBlockedError(
            "This import's Reconciliation already has an owner-authored Adjustment. Undo is not available."
          );
        }
      }
    }

    const db = getScopedDb(this.connectionString);

    if (existing.asOfDate !== null) {
      const laterSnapshots = await db
        .select({ id: balanceSnapshots.id })
        .from(balanceSnapshots)
        .where(
          and(
            eq(balanceSnapshots.accountId, existing.accountId),
            eq(balanceSnapshots.ownerId, this.ownerId),
            gt(balanceSnapshots.asOfDate, existing.asOfDate)
          )
        )
        .limit(1);
      if (laterSnapshots.length > 0) {
        throw new ImportBatchUndoBlockedError(
          "A later Reconciliation already exists for this Account. Undo is not available."
        );
      }
    }

    // import_batches.reconciliation_id/balance_snapshot_id reference those tables, so the batch
    // row (the referencer) must go first, before either referenced row can be deleted.
    await db.transaction(async (tx) => {
      await tx
        .delete(transactions)
        .where(and(eq(transactions.importBatchId, id), eq(transactions.ownerId, this.ownerId)));
      await tx.delete(importBatches).where(and(eq(importBatches.id, id), eq(importBatches.ownerId, this.ownerId)));
      if (existing.reconciliationId !== null) {
        await tx
          .delete(discrepancies)
          .where(
            and(
              eq(discrepancies.reconciliationId, existing.reconciliationId),
              eq(discrepancies.ownerId, this.ownerId)
            )
          );
        await tx
          .delete(reconciliations)
          .where(and(eq(reconciliations.id, existing.reconciliationId), eq(reconciliations.ownerId, this.ownerId)));
      }
      if (existing.balanceSnapshotId !== null) {
        await tx
          .delete(balanceSnapshots)
          .where(and(eq(balanceSnapshots.id, existing.balanceSnapshotId), eq(balanceSnapshots.ownerId, this.ownerId)));
      }
    });
  }

  async delete(id: string): Promise<void> {
    const existing = await this.getById(id);
    if (!existing) {
      return;
    }
    if (existing.confirmedAt !== null) {
      throw new ImportBatchAlreadyConfirmedError();
    }

    const db = getScopedDb(this.connectionString);

    await db.transaction(async (tx) => {
      await tx
        .delete(transactions)
        .where(and(eq(transactions.importBatchId, id), eq(transactions.ownerId, this.ownerId)));
      await tx.delete(importBatches).where(and(eq(importBatches.id, id), eq(importBatches.ownerId, this.ownerId)));
    });
  }
}
