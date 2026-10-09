import { and, desc, eq, isNotNull } from "drizzle-orm";

import {
  DatabaseConstraintError,
  StockImportBatchAlreadyConfirmedError,
  StockImportBatchHasUnresolvedDuplicatesError,
  StockImportBatchNotFoundError
} from "@/db/errors";
import { PgShareTradingAccountRepository } from "@/db/postgres/repositories/share-trading-account-repository";
import { getScopedDb } from "@/db/postgres/scoped-db";
import { stockImportBatches, stockTransactions } from "@/db/postgres/schema";
import type {
  CreateStockImportBatchInput,
  StockImportBatchLineItemInput,
  StockImportBatchRepositoryPort
} from "@/db/repositories/ports";
import { assertValidCalendarDate } from "@/domain/calendar-date";
import { parseDecimalToMinorUnits } from "@/domain/decimal-input";
import { InvalidMinorUnitsError } from "@/domain/money";
import { EmptyStockImportBatchError, type StockImportBatch } from "@/domain/stock-import-batch";
import { parseWholeShareQuantity } from "@/domain/stock-transaction";

function rowToStockImportBatch(row: typeof stockImportBatches.$inferSelect): StockImportBatch {
  return {
    id: row.id,
    shareTradingAccountId: row.shareTradingAccountId,
    source: row.source,
    createdAt: row.createdAt,
    confirmedAt: row.confirmedAt
  };
}

export class PgStockImportBatchRepository implements StockImportBatchRepositoryPort {
  constructor(
    private readonly connectionString: string,
    private readonly ownerId: string
  ) {}

  async create(
    input: CreateStockImportBatchInput,
    lineItems: StockImportBatchLineItemInput[]
  ): Promise<StockImportBatch> {
    if (lineItems.length === 0) {
      throw new EmptyStockImportBatchError();
    }

    const shareTradingAccount = await new PgShareTradingAccountRepository(
      this.connectionString,
      this.ownerId
    ).getById(input.shareTradingAccountId);
    if (!shareTradingAccount) {
      throw new DatabaseConstraintError(
        new Error(`ShareTradingAccount ${input.shareTradingAccountId} does not exist.`)
      );
    }

    const db = getScopedDb(this.connectionString);

    // Suspected Duplicate matching (CONTEXT.md) — mirrors PgImportBatchRepository/
    // StockImportBatchRepository (SQLite).
    const existingRows = await db
      .select({
        id: stockTransactions.id,
        occurredAt: stockTransactions.occurredAt,
        scripCode: stockTransactions.scripCode,
        type: stockTransactions.type,
        quantity: stockTransactions.quantity,
        pricePerUnitMinor: stockTransactions.pricePerUnitMinor,
        externalRef: stockTransactions.externalRef,
        importBatchCreatedAt: stockImportBatches.createdAt
      })
      .from(stockTransactions)
      .leftJoin(stockImportBatches, eq(stockTransactions.importBatchId, stockImportBatches.id))
      .where(
        and(
          eq(stockTransactions.shareTradingAccountId, input.shareTradingAccountId),
          eq(stockTransactions.ownerId, this.ownerId)
        )
      );
    existingRows.sort((a, b) => {
      const aKey = a.importBatchCreatedAt ?? "";
      const bKey = b.importBatchCreatedAt ?? "";
      return aKey === bKey ? a.id.localeCompare(b.id) : aKey.localeCompare(bKey);
    });
    const matchingIdByKey = new Map<string, string>();
    const matchingIdByExternalRef = new Map<string, string>();
    for (const existing of existingRows) {
      const key = `${existing.occurredAt.slice(0, 10)}|${existing.scripCode}|${existing.type}|${existing.quantity}|${existing.pricePerUnitMinor}`;
      if (!matchingIdByKey.has(key)) {
        matchingIdByKey.set(key, existing.id);
      }
      if (existing.externalRef !== null && !matchingIdByExternalRef.has(existing.externalRef)) {
        matchingIdByExternalRef.set(existing.externalRef, existing.id);
      }
    }

    const parsedLineItems = lineItems.map((lineItem) => {
      assertValidCalendarDate(lineItem.occurredAt);
      const quantity = parseWholeShareQuantity(lineItem.quantity);
      const pricePerUnitMinor = parseDecimalToMinorUnits(lineItem.price, shareTradingAccount.currencyCode);
      if (pricePerUnitMinor < 0) {
        throw new InvalidMinorUnitsError();
      }
      const scripCode = lineItem.scripCode.trim().toUpperCase();
      const key = `${lineItem.occurredAt}|${scripCode}|${lineItem.type}|${quantity}|${pricePerUnitMinor}`;
      const externalRef = lineItem.externalRef ?? null;
      const possibleDuplicateOfTransactionId =
        (externalRef !== null ? matchingIdByExternalRef.get(externalRef) : undefined) ??
        matchingIdByKey.get(key) ??
        null;
      if (!matchingIdByKey.has(key)) {
        matchingIdByKey.set(key, lineItem.id);
      }
      if (externalRef !== null && !matchingIdByExternalRef.has(externalRef)) {
        matchingIdByExternalRef.set(externalRef, lineItem.id);
      }
      return {
        ...lineItem,
        scripCode,
        quantity,
        pricePerUnitMinor,
        externalRef,
        possibleDuplicateOfTransactionId
      };
    });

    const batch: StockImportBatch = {
      id: input.id,
      shareTradingAccountId: input.shareTradingAccountId,
      source: input.source,
      createdAt: input.createdAt,
      confirmedAt: null
    };

    try {
      await db.transaction(async (tx) => {
        await tx.insert(stockImportBatches).values({
          id: batch.id,
          ownerId: this.ownerId,
          shareTradingAccountId: batch.shareTradingAccountId,
          source: batch.source,
          createdAt: batch.createdAt,
          confirmedAt: null
        });

        for (const lineItem of parsedLineItems) {
          await tx.insert(stockTransactions).values({
            id: lineItem.id,
            ownerId: this.ownerId,
            shareTradingAccountId: batch.shareTradingAccountId,
            scripCode: lineItem.scripCode,
            type: lineItem.type,
            quantity: lineItem.quantity,
            pricePerUnitMinor: lineItem.pricePerUnitMinor,
            occurredAt: `${lineItem.occurredAt}T00:00:00.000Z`,
            description: lineItem.description,
            trustStatus: "Imported",
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

  async getById(id: string): Promise<StockImportBatch | null> {
    const db = getScopedDb(this.connectionString);

    const rows = await db
      .select()
      .from(stockImportBatches)
      .where(and(eq(stockImportBatches.id, id), eq(stockImportBatches.ownerId, this.ownerId)));

    const row = rows[0];
    return row ? rowToStockImportBatch(row) : null;
  }

  async listAll(): Promise<StockImportBatch[]> {
    const db = getScopedDb(this.connectionString);

    const rows = await db
      .select()
      .from(stockImportBatches)
      .where(eq(stockImportBatches.ownerId, this.ownerId))
      .orderBy(desc(stockImportBatches.createdAt));

    return rows.map(rowToStockImportBatch);
  }

  async confirmAll(id: string): Promise<StockImportBatch> {
    const existing = await this.getById(id);
    if (!existing) {
      throw new StockImportBatchNotFoundError(id);
    }
    if (existing.confirmedAt !== null) {
      throw new StockImportBatchAlreadyConfirmedError();
    }

    const db = getScopedDb(this.connectionString);

    const unresolvedDuplicates = await db
      .select({ id: stockTransactions.id })
      .from(stockTransactions)
      .where(
        and(
          eq(stockTransactions.importBatchId, id),
          eq(stockTransactions.ownerId, this.ownerId),
          isNotNull(stockTransactions.possibleDuplicateOfTransactionId)
        )
      )
      .limit(1);
    if (unresolvedDuplicates.length > 0) {
      throw new StockImportBatchHasUnresolvedDuplicatesError();
    }

    const now = new Date().toISOString();

    await db.transaction(async (tx) => {
      await tx
        .update(stockTransactions)
        .set({ trustStatus: "Confirmed" })
        .where(and(eq(stockTransactions.importBatchId, id), eq(stockTransactions.ownerId, this.ownerId)));

      await tx
        .update(stockImportBatches)
        .set({ confirmedAt: now })
        .where(and(eq(stockImportBatches.id, id), eq(stockImportBatches.ownerId, this.ownerId)));
    });

    return { ...existing, confirmedAt: now };
  }

  async delete(id: string): Promise<void> {
    const existing = await this.getById(id);
    if (!existing) {
      return;
    }
    if (existing.confirmedAt !== null) {
      throw new StockImportBatchAlreadyConfirmedError();
    }

    const db = getScopedDb(this.connectionString);

    await db.transaction(async (tx) => {
      await tx
        .delete(stockTransactions)
        .where(and(eq(stockTransactions.importBatchId, id), eq(stockTransactions.ownerId, this.ownerId)));
      await tx
        .delete(stockImportBatches)
        .where(and(eq(stockImportBatches.id, id), eq(stockImportBatches.ownerId, this.ownerId)));
    });
  }
}
