import { and, desc, eq, gt, isNotNull } from "drizzle-orm";

import type { DrizzleDb } from "@/db/client";
import type { ImportBatch } from "@/domain/import-batch";
import { AccountRepository } from "@/db/repositories/account-repository";
import { assertValidCalendarDate } from "@/domain/calendar-date";
import { assertValidClosingBalance, EmptyImportBatchError } from "@/domain/import-batch";
import { BalanceSnapshotRepository } from "@/db/repositories/balance-snapshot-repository";
import {
  DatabaseConstraintError,
  ImportBatchAlreadyConfirmedError,
  ImportBatchHasUnresolvedDuplicatesError,
  ImportBatchNotConfirmedError,
  ImportBatchNotFoundError,
  ImportBatchUndoBlockedError,
  runDatabaseWrite
} from "@/db/errors";
import type {
  CreateImportBatchInput,
  ImportBatchRepositoryPort,
  ImportBatchTransactionInput
} from "@/db/repositories/ports";
import { balanceSnapshots, discrepancies, importBatches, reconciliations, transactions } from "@/db/schema";
import { parseDecimalToMinorUnits } from "@/domain/decimal-input";
import { normalizeTransactionTimestamp } from "@/domain/transaction";
import { ReconciliationRepository } from "@/db/repositories/reconciliation-repository";
import { AdjustmentRepository } from "@/db/repositories/adjustment-repository";

export type { CreateImportBatchInput, ImportBatchTransactionInput };

function toImportBatch(row: {
  id: string;
  accountId: string;
  source: string;
  createdAt: string;
  closingBalanceMinor: number | null;
  asOfDate: string | null;
  confirmedAt: string | null;
  balanceSnapshotId: string | null;
  reconciliationId: string | null;
}): ImportBatch {
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

export class ImportBatchRepository implements ImportBatchRepositoryPort {
  constructor(private readonly db: DrizzleDb) {}

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

    const account = await new AccountRepository(this.db).getById(input.accountId);
    if (!account) {
      throw new DatabaseConstraintError(new Error(`Account ${input.accountId} does not exist.`));
    }

    const closingBalanceMinor =
      input.closingBalance !== null ? parseDecimalToMinorUnits(input.closingBalance, account.currencyCode) : null;

    // Suspected Duplicate matching (CONTEXT.md): keyed by calendar date + amount, same as
    // stage_import's advisory check (src/app/api/mcp/tools.ts) — occurredAt compares by calendar
    // date, not exact timestamp, since a previously-imported row is normalized to midnight UTC.
    // Existing rows are earliest-first (a manually-entered Transaction has no ImportBatch and is
    // always treated as the presumed original; among imported rows, the earlier ImportBatch wins),
    // so the map below is seeded with the earliest match per key and never overwritten — a later
    // line item in *this* batch that repeats an earlier one then also lands on the first occurrence
    // via the same map, since nothing outranks an already-set key.
    const existingRows = await this.db
      .select({
        id: transactions.id,
        occurredAt: transactions.occurredAt,
        amountMinor: transactions.amountMinor,
        externalRef: transactions.externalRef,
        importBatchCreatedAt: importBatches.createdAt
      })
      .from(transactions)
      .leftJoin(importBatches, eq(transactions.importBatchId, importBatches.id))
      .where(eq(transactions.accountId, input.accountId));
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

    await runDatabaseWrite(async () =>
      this.db.transaction((tx) => {
        tx.insert(importBatches)
          .values({
            id: batch.id,
            accountId: batch.accountId,
            source: batch.source,
            createdAt: batch.createdAt,
            closingBalanceMinor: batch.closingBalanceMinor,
            asOfDate: batch.asOfDate,
            confirmedAt: null,
            balanceSnapshotId: null,
            reconciliationId: null
          })
          .run();

        for (const lineItem of parsedLineItems) {
          tx.insert(transactions)
            .values({
              id: lineItem.id,
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
            })
            .run();
        }
      })
    );

    return batch;
  }

  async getById(id: string): Promise<ImportBatch | null> {
    const row = await this.db.query.importBatches.findFirst({
      where: eq(importBatches.id, id)
    });

    return row ? toImportBatch(row) : null;
  }

  /** Most recent first (`docs/specs/import.md`), for the `/imports` review list. */
  async listAll(): Promise<ImportBatch[]> {
    const rows = await this.db.query.importBatches.findMany({
      orderBy: [desc(importBatches.createdAt)]
    });

    return rows.map(toImportBatch);
  }

  async confirmAll(id: string): Promise<ImportBatch> {
    const existing = await this.getById(id);
    if (!existing) {
      throw new ImportBatchNotFoundError(id);
    }
    if (existing.confirmedAt !== null) {
      throw new ImportBatchAlreadyConfirmedError();
    }

    const unresolvedDuplicate = await this.db.query.transactions.findFirst({
      where: and(eq(transactions.importBatchId, id), isNotNull(transactions.possibleDuplicateOfTransactionId))
    });
    if (unresolvedDuplicate) {
      throw new ImportBatchHasUnresolvedDuplicatesError();
    }

    await runDatabaseWrite(() =>
      this.db
        .update(transactions)
        .set({ trustStatus: "Confirmed" })
        .where(eq(transactions.importBatchId, id))
    );

    let balanceSnapshotId: string | null = null;
    let reconciliationId: string | null = null;
    const now = new Date().toISOString();

    if (existing.closingBalanceMinor !== null && existing.asOfDate !== null) {
      balanceSnapshotId = `${id}-snapshot`;
      reconciliationId = `${id}-reconciliation`;

      try {
        await new BalanceSnapshotRepository(this.db).create({
          id: balanceSnapshotId,
          accountId: existing.accountId,
          asOfDate: existing.asOfDate,
          balanceMinor: existing.closingBalanceMinor
        });

        await new ReconciliationRepository(this.db).create({
          id: reconciliationId,
          accountId: existing.accountId,
          balanceSnapshotId,
          reconciledAt: now
        });
      } catch (error) {
        // Two concurrent confirmAll calls (a double-click before the button disables, or a
        // back-button resubmit) can both read confirmedAt === null before either writes —
        // confirmAll is deliberately not one atomic transaction (see the class doc comment).
        // The loser hits a duplicate deterministic snapshot/reconciliation id — a real
        // DatabaseConstraintError, not a generic failure — and its winner may not have finished
        // writing confirmedAt yet, so re-checking the batch's state here is unreliable. Report
        // it the same way the already-confirmed case is reported instead of a raw constraint error.
        if (error instanceof DatabaseConstraintError) {
          throw new ImportBatchAlreadyConfirmedError();
        }
        throw error;
      }
    }

    await runDatabaseWrite(() =>
      this.db
        .update(importBatches)
        .set({ confirmedAt: now, balanceSnapshotId, reconciliationId })
        .where(eq(importBatches.id, id))
    );

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
      const reconciliationRepository = new ReconciliationRepository(this.db);
      const discrepancy = await reconciliationRepository.getDiscrepancyByReconciliationId(
        existing.reconciliationId
      );
      if (discrepancy) {
        const adjustment = await new AdjustmentRepository(this.db).getByDiscrepancyId(discrepancy.id);
        if (adjustment) {
          throw new ImportBatchUndoBlockedError(
            "This import's Reconciliation already has an owner-authored Adjustment. Undo is not available."
          );
        }
      }
    }

    if (existing.asOfDate !== null) {
      const laterSnapshot = await this.db.query.balanceSnapshots.findFirst({
        where: and(eq(balanceSnapshots.accountId, existing.accountId), gt(balanceSnapshots.asOfDate, existing.asOfDate))
      });
      if (laterSnapshot) {
        throw new ImportBatchUndoBlockedError(
          "A later Reconciliation already exists for this Account. Undo is not available."
        );
      }
    }

    await runDatabaseWrite(async () =>
      this.db.transaction((tx) => {
        // import_batches.reconciliation_id/balance_snapshot_id reference those tables with
        // ON DELETE RESTRICT, so the batch row (the referencer) must go first, before either
        // referenced row can be deleted.
        tx.delete(transactions).where(eq(transactions.importBatchId, id)).run();
        tx.delete(importBatches).where(eq(importBatches.id, id)).run();
        if (existing.reconciliationId !== null) {
          tx.delete(discrepancies).where(eq(discrepancies.reconciliationId, existing.reconciliationId)).run();
          tx.delete(reconciliations).where(eq(reconciliations.id, existing.reconciliationId)).run();
        }
        if (existing.balanceSnapshotId !== null) {
          tx.delete(balanceSnapshots).where(eq(balanceSnapshots.id, existing.balanceSnapshotId)).run();
        }
      })
    );
  }

  async delete(id: string): Promise<void> {
    const existing = await this.getById(id);
    if (!existing) {
      return;
    }
    if (existing.confirmedAt !== null) {
      throw new ImportBatchAlreadyConfirmedError();
    }

    await runDatabaseWrite(async () =>
      this.db.transaction((tx) => {
        tx.delete(transactions).where(eq(transactions.importBatchId, id)).run();
        tx.delete(importBatches).where(eq(importBatches.id, id)).run();
      })
    );
  }
}
