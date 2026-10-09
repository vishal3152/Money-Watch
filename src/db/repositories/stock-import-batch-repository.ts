import { and, desc, eq, isNotNull } from "drizzle-orm";

import type { DrizzleDb } from "@/db/client";
import {
  DatabaseConstraintError,
  StockImportBatchAlreadyConfirmedError,
  StockImportBatchHasUnresolvedDuplicatesError,
  StockImportBatchNotFoundError,
  runDatabaseWrite
} from "@/db/errors";
import { ShareTradingAccountRepository } from "@/db/repositories/share-trading-account-repository";
import type {
  CreateStockImportBatchInput,
  StockImportBatchLineItemInput,
  StockImportBatchRepositoryPort
} from "@/db/repositories/ports";
import { stockImportBatches, stockTransactions } from "@/db/schema";
import { assertValidCalendarDate } from "@/domain/calendar-date";
import { parseDecimalToMinorUnits } from "@/domain/decimal-input";
import { InvalidMinorUnitsError } from "@/domain/money";
import type { StockImportBatch } from "@/domain/stock-import-batch";
import { EmptyStockImportBatchError } from "@/domain/stock-import-batch";
import { parseWholeShareQuantity } from "@/domain/stock-transaction";

export type { CreateStockImportBatchInput, StockImportBatchLineItemInput };

function toStockImportBatch(row: {
  id: string;
  shareTradingAccountId: string;
  source: string;
  createdAt: string;
  confirmedAt: string | null;
}): StockImportBatch {
  return {
    id: row.id,
    shareTradingAccountId: row.shareTradingAccountId,
    source: row.source,
    createdAt: row.createdAt,
    confirmedAt: row.confirmedAt
  };
}

export class StockImportBatchRepository implements StockImportBatchRepositoryPort {
  constructor(private readonly db: DrizzleDb) {}

  async create(
    input: CreateStockImportBatchInput,
    lineItems: StockImportBatchLineItemInput[]
  ): Promise<StockImportBatch> {
    if (lineItems.length === 0) {
      throw new EmptyStockImportBatchError();
    }

    const shareTradingAccount = await new ShareTradingAccountRepository(this.db).getById(
      input.shareTradingAccountId
    );
    if (!shareTradingAccount) {
      throw new DatabaseConstraintError(
        new Error(`ShareTradingAccount ${input.shareTradingAccountId} does not exist.`)
      );
    }

    // Suspected Duplicate matching (CONTEXT.md) — mirrors ImportBatchRepository (SQLite): existing
    // rows are earliest-first (a manually-entered StockTransaction has no StockImportBatch and is
    // always treated as the presumed original; among imported rows, the earlier StockImportBatch
    // wins). A ref-numbered line only ever matches another row that also has a ref, falling back to
    // the natural key (date + scrip + type + quantity + price) when no ref match is found.
    const existingRows = await this.db
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
      .where(eq(stockTransactions.shareTradingAccountId, input.shareTradingAccountId));
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

    await runDatabaseWrite(async () =>
      this.db.transaction((tx) => {
        tx.insert(stockImportBatches)
          .values({
            id: batch.id,
            shareTradingAccountId: batch.shareTradingAccountId,
            source: batch.source,
            createdAt: batch.createdAt,
            confirmedAt: null
          })
          .run();

        for (const lineItem of parsedLineItems) {
          tx.insert(stockTransactions)
            .values({
              id: lineItem.id,
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
            })
            .run();
        }
      })
    );

    return batch;
  }

  async getById(id: string): Promise<StockImportBatch | null> {
    const row = await this.db.query.stockImportBatches.findFirst({
      where: eq(stockImportBatches.id, id)
    });

    return row ? toStockImportBatch(row) : null;
  }

  async listAll(): Promise<StockImportBatch[]> {
    const rows = await this.db.query.stockImportBatches.findMany({
      orderBy: [desc(stockImportBatches.createdAt)]
    });

    return rows.map(toStockImportBatch);
  }

  async confirmAll(id: string): Promise<StockImportBatch> {
    const existing = await this.getById(id);
    if (!existing) {
      throw new StockImportBatchNotFoundError(id);
    }
    if (existing.confirmedAt !== null) {
      throw new StockImportBatchAlreadyConfirmedError();
    }

    const unresolvedDuplicate = await this.db.query.stockTransactions.findFirst({
      where: and(eq(stockTransactions.importBatchId, id), isNotNull(stockTransactions.possibleDuplicateOfTransactionId))
    });
    if (unresolvedDuplicate) {
      throw new StockImportBatchHasUnresolvedDuplicatesError();
    }

    await runDatabaseWrite(() =>
      this.db
        .update(stockTransactions)
        .set({ trustStatus: "Confirmed" })
        .where(eq(stockTransactions.importBatchId, id))
    );

    const now = new Date().toISOString();
    await runDatabaseWrite(() =>
      this.db.update(stockImportBatches).set({ confirmedAt: now }).where(eq(stockImportBatches.id, id))
    );

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

    await runDatabaseWrite(async () =>
      this.db.transaction((tx) => {
        tx.delete(stockTransactions).where(eq(stockTransactions.importBatchId, id)).run();
        tx.delete(stockImportBatches).where(eq(stockImportBatches.id, id)).run();
      })
    );
  }
}
