import { and, asc, eq, inArray, ne, sql } from "drizzle-orm";

import type { StockTransaction } from "@/domain/stock-transaction";
import type { DrizzleDb } from "@/db/client";
import { StockTransactionNotFoundError, runDatabaseWrite } from "@/db/errors";
import type { StockTransactionRepositoryPort, StockTransactionUpdateInput } from "@/db/repositories/ports";
import { stockTransactions } from "@/db/schema";

function toStockTransaction(row: {
  id: string;
  shareTradingAccountId: string;
  scripCode: string;
  type: StockTransaction["type"];
  quantity: number;
  pricePerUnitMinor: number;
  occurredAt: string;
  description: string;
  trustStatus: StockTransaction["trustStatus"];
  importBatchId: string | null;
  externalRef: string | null;
  possibleDuplicateOfTransactionId: string | null;
}): StockTransaction {
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

export class StockTransactionRepository implements StockTransactionRepositoryPort {
  constructor(private readonly db: DrizzleDb) {}

  async create(input: StockTransaction): Promise<StockTransaction> {
    await runDatabaseWrite(() =>
      this.db.insert(stockTransactions).values({
        id: input.id,
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
      })
    );

    return input;
  }

  async getById(stockTransactionId: string): Promise<StockTransaction | null> {
    const row = await this.db.query.stockTransactions.findFirst({
      where: eq(stockTransactions.id, stockTransactionId)
    });

    if (!row) {
      return null;
    }

    return toStockTransaction(row);
  }

  async listByShareTradingAccountId(shareTradingAccountId: string): Promise<StockTransaction[]> {
    const rows = await this.db.query.stockTransactions.findMany({
      where: eq(stockTransactions.shareTradingAccountId, shareTradingAccountId),
      orderBy: [asc(stockTransactions.occurredAt), asc(stockTransactions.id)]
    });

    return rows.map(toStockTransaction);
  }

  async listByShareTradingAccountIds(shareTradingAccountIds: string[]): Promise<StockTransaction[]> {
    if (shareTradingAccountIds.length === 0) {
      return [];
    }

    const rows = await this.db.query.stockTransactions.findMany({
      where: inArray(stockTransactions.shareTradingAccountId, shareTradingAccountIds),
      orderBy: [
        asc(stockTransactions.shareTradingAccountId),
        asc(stockTransactions.occurredAt),
        asc(stockTransactions.id)
      ]
    });

    return rows.map(toStockTransaction);
  }

  async listByImportBatchId(importBatchId: string): Promise<StockTransaction[]> {
    const rows = await this.db.query.stockTransactions.findMany({
      where: eq(stockTransactions.importBatchId, importBatchId),
      orderBy: [asc(stockTransactions.occurredAt), asc(stockTransactions.id)]
    });

    return rows.map(toStockTransaction);
  }

  async sumQuantityByScripCode(
    shareTradingAccountId: string,
    scripCode: string,
    options?: { excludeId?: string }
  ): Promise<number> {
    const conditions = [
      eq(stockTransactions.shareTradingAccountId, shareTradingAccountId),
      eq(stockTransactions.scripCode, scripCode)
    ];
    if (options?.excludeId) {
      conditions.push(ne(stockTransactions.id, options.excludeId));
    }

    const [row] = await this.db
      .select({
        total: sql<number>`coalesce(sum(case when ${stockTransactions.type} = 'Buy' then ${stockTransactions.quantity} else -${stockTransactions.quantity} end), 0)`
      })
      .from(stockTransactions)
      .where(and(...conditions));

    return row?.total ?? 0;
  }

  async update(stockTransactionId: string, fields: StockTransactionUpdateInput): Promise<StockTransaction> {
    const existing = await this.db.query.stockTransactions.findFirst({
      where: eq(stockTransactions.id, stockTransactionId)
    });

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

    await runDatabaseWrite(() =>
      this.db.update(stockTransactions).set(next).where(eq(stockTransactions.id, stockTransactionId))
    );

    return toStockTransaction({ ...existing, ...next });
  }

  async delete(stockTransactionId: string): Promise<void> {
    await runDatabaseWrite(() =>
      this.db.delete(stockTransactions).where(eq(stockTransactions.id, stockTransactionId))
    );
  }

  async dismissSuspectedDuplicate(stockTransactionId: string): Promise<StockTransaction> {
    const existing = await this.db.query.stockTransactions.findFirst({
      where: eq(stockTransactions.id, stockTransactionId)
    });

    if (!existing) {
      throw new StockTransactionNotFoundError(stockTransactionId);
    }

    await runDatabaseWrite(() =>
      this.db
        .update(stockTransactions)
        .set({ possibleDuplicateOfTransactionId: null })
        .where(eq(stockTransactions.id, stockTransactionId))
    );

    return toStockTransaction({ ...existing, possibleDuplicateOfTransactionId: null });
  }
}
