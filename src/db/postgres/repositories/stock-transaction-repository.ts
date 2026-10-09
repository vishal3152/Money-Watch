import { and, asc, eq, inArray, ne, sql } from "drizzle-orm";

import type { StockTransaction } from "@/domain/stock-transaction";
import { StockTransactionNotFoundError } from "@/db/errors";
import { getScopedDb } from "@/db/postgres/scoped-db";
import { stockTransactions } from "@/db/postgres/schema";
import type { StockTransactionRepositoryPort, StockTransactionUpdateInput } from "@/db/repositories/ports";

function rowToStockTransaction(row: typeof stockTransactions.$inferSelect): StockTransaction {
  return {
    id: row.id,
    shareTradingAccountId: row.shareTradingAccountId,
    scripCode: row.scripCode,
    type: row.type,
    quantity: row.quantity,
    pricePerUnitMinor: row.pricePerUnitMinor,
    occurredAt: row.occurredAt,
    description: row.description,
    trustStatus: row.trustStatus,
    importBatchId: row.importBatchId,
    externalRef: row.externalRef,
    possibleDuplicateOfTransactionId: row.possibleDuplicateOfTransactionId
  };
}

export class PgStockTransactionRepository implements StockTransactionRepositoryPort {
  constructor(
    private readonly connectionString: string,
    private readonly ownerId: string
  ) {}

  async create(input: StockTransaction): Promise<StockTransaction> {
    const db = getScopedDb(this.connectionString);

    await db.insert(stockTransactions).values({
      id: input.id,
      ownerId: this.ownerId,
      shareTradingAccountId: input.shareTradingAccountId,
      scripCode: input.scripCode,
      type: input.type,
      quantity: input.quantity,
      pricePerUnitMinor: input.pricePerUnitMinor,
      occurredAt: input.occurredAt,
      description: input.description,
      trustStatus: input.trustStatus,
      importBatchId: input.importBatchId,
      externalRef: input.externalRef ?? null,
      possibleDuplicateOfTransactionId: input.possibleDuplicateOfTransactionId ?? null
    });

    return input;
  }

  async getById(stockTransactionId: string): Promise<StockTransaction | null> {
    const db = getScopedDb(this.connectionString);

    const rows = await db
      .select()
      .from(stockTransactions)
      .where(and(eq(stockTransactions.id, stockTransactionId), eq(stockTransactions.ownerId, this.ownerId)));

    const row = rows[0];
    return row ? rowToStockTransaction(row) : null;
  }

  async listByShareTradingAccountId(shareTradingAccountId: string): Promise<StockTransaction[]> {
    const db = getScopedDb(this.connectionString);

    const rows = await db
      .select()
      .from(stockTransactions)
      .where(
        and(
          eq(stockTransactions.shareTradingAccountId, shareTradingAccountId),
          eq(stockTransactions.ownerId, this.ownerId)
        )
      )
      .orderBy(asc(stockTransactions.occurredAt), asc(stockTransactions.id));

    return rows.map(rowToStockTransaction);
  }

  async listByShareTradingAccountIds(shareTradingAccountIds: string[]): Promise<StockTransaction[]> {
    if (shareTradingAccountIds.length === 0) {
      return [];
    }

    const db = getScopedDb(this.connectionString);

    const rows = await db
      .select()
      .from(stockTransactions)
      .where(
        and(
          inArray(stockTransactions.shareTradingAccountId, shareTradingAccountIds),
          eq(stockTransactions.ownerId, this.ownerId)
        )
      )
      .orderBy(
        asc(stockTransactions.shareTradingAccountId),
        asc(stockTransactions.occurredAt),
        asc(stockTransactions.id)
      );

    return rows.map(rowToStockTransaction);
  }

  async listByImportBatchId(importBatchId: string): Promise<StockTransaction[]> {
    const db = getScopedDb(this.connectionString);

    const rows = await db
      .select()
      .from(stockTransactions)
      .where(and(eq(stockTransactions.importBatchId, importBatchId), eq(stockTransactions.ownerId, this.ownerId)))
      .orderBy(asc(stockTransactions.occurredAt), asc(stockTransactions.id));

    return rows.map(rowToStockTransaction);
  }

  async sumQuantityByScripCode(
    shareTradingAccountId: string,
    scripCode: string,
    options?: { excludeId?: string }
  ): Promise<number> {
    const db = getScopedDb(this.connectionString);

    const conditions = [
      eq(stockTransactions.shareTradingAccountId, shareTradingAccountId),
      eq(stockTransactions.scripCode, scripCode),
      eq(stockTransactions.ownerId, this.ownerId)
    ];
    if (options?.excludeId) {
      conditions.push(ne(stockTransactions.id, options.excludeId));
    }

    const [row] = await db
      .select({
        total: sql<string>`coalesce(sum(case when ${stockTransactions.type} = 'Buy' then ${stockTransactions.quantity} else -${stockTransactions.quantity} end), 0)`
      })
      .from(stockTransactions)
      .where(and(...conditions));

    return row ? Number(row.total) : 0;
  }

  async update(stockTransactionId: string, fields: StockTransactionUpdateInput): Promise<StockTransaction> {
    const db = getScopedDb(this.connectionString);
    const rows = await db
      .select()
      .from(stockTransactions)
      .where(and(eq(stockTransactions.id, stockTransactionId), eq(stockTransactions.ownerId, this.ownerId)));
    const existing = rows[0];

    if (!existing) {
      throw new StockTransactionNotFoundError(stockTransactionId);
    }

    const next = {
      scripCode: fields.scripCode ?? existing.scripCode,
      type: fields.type ?? existing.type,
      quantity: fields.quantity ?? existing.quantity,
      pricePerUnitMinor: fields.pricePerUnitMinor ?? existing.pricePerUnitMinor,
      occurredAt: fields.occurredAt ?? existing.occurredAt,
      description: fields.description ?? existing.description
    };

    await db
      .update(stockTransactions)
      .set(next)
      .where(and(eq(stockTransactions.id, stockTransactionId), eq(stockTransactions.ownerId, this.ownerId)));

    return rowToStockTransaction({ ...existing, ...next });
  }

  async delete(stockTransactionId: string): Promise<void> {
    const db = getScopedDb(this.connectionString);

    await db
      .delete(stockTransactions)
      .where(and(eq(stockTransactions.id, stockTransactionId), eq(stockTransactions.ownerId, this.ownerId)));
  }

  async dismissSuspectedDuplicate(stockTransactionId: string): Promise<StockTransaction> {
    const db = getScopedDb(this.connectionString);
    const rows = await db
      .select()
      .from(stockTransactions)
      .where(and(eq(stockTransactions.id, stockTransactionId), eq(stockTransactions.ownerId, this.ownerId)));
    const existing = rows[0];

    if (!existing) {
      throw new StockTransactionNotFoundError(stockTransactionId);
    }

    await db
      .update(stockTransactions)
      .set({ possibleDuplicateOfTransactionId: null })
      .where(and(eq(stockTransactions.id, stockTransactionId), eq(stockTransactions.ownerId, this.ownerId)));

    return rowToStockTransaction({ ...existing, possibleDuplicateOfTransactionId: null });
  }
}
