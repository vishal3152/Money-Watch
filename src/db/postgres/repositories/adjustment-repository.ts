import { and, eq, inArray } from "drizzle-orm";

import { getScopedDb } from "@/db/postgres/scoped-db";
import { adjustments, transactions } from "@/db/postgres/schema";
import type { AdjustmentRepositoryPort, CreateAdjustmentTransactionInput } from "@/db/repositories/ports";
import type { Adjustment } from "@/domain/adjustment";
import { assertMinorUnits } from "@/domain/money";
import { normalizeTransactionTimestamp } from "@/domain/transaction";

function rowToAdjustment(row: typeof adjustments.$inferSelect): Adjustment {
  return {
    id: row.id,
    transactionId: row.transactionId,
    discrepancyId: row.discrepancyId
  };
}

export class PgAdjustmentRepository implements AdjustmentRepositoryPort {
  constructor(
    private readonly connectionString: string,
    private readonly ownerId: string
  ) {}

  async create(transaction: CreateAdjustmentTransactionInput, discrepancyId: string): Promise<Adjustment> {
    assertMinorUnits(transaction.amountMinor);

    const occurredAt = normalizeTransactionTimestamp(transaction.occurredAt);
    const adjustment: Adjustment = {
      id: `${transaction.id}-adjustment`,
      transactionId: transaction.id,
      discrepancyId
    };

    const db = getScopedDb(this.connectionString);

    await db.transaction(async (tx) => {
      await tx.insert(transactions).values({
        id: transaction.id,
        ownerId: this.ownerId,
        accountId: transaction.accountId,
        amountMinor: transaction.amountMinor,
        occurredAt,
        description: transaction.description,
        trustStatus: "Confirmed",
        transferId: null,
        category: null
      });

      await tx.insert(adjustments).values({
        id: adjustment.id,
        ownerId: this.ownerId,
        transactionId: adjustment.transactionId,
        discrepancyId: adjustment.discrepancyId
      });
    });

    return adjustment;
  }

  async getByDiscrepancyId(discrepancyId: string): Promise<Adjustment | null> {
    const db = getScopedDb(this.connectionString);

    const rows = await db
      .select()
      .from(adjustments)
      .where(and(eq(adjustments.discrepancyId, discrepancyId), eq(adjustments.ownerId, this.ownerId)));

    const row = rows[0];
    return row ? rowToAdjustment(row) : null;
  }

  async getByTransactionId(transactionId: string): Promise<Adjustment | null> {
    const db = getScopedDb(this.connectionString);

    const rows = await db
      .select()
      .from(adjustments)
      .where(and(eq(adjustments.transactionId, transactionId), eq(adjustments.ownerId, this.ownerId)));

    const row = rows[0];
    return row ? rowToAdjustment(row) : null;
  }

  async listByTransactionIds(transactionIds: string[]): Promise<Adjustment[]> {
    if (transactionIds.length === 0) {
      return [];
    }

    const db = getScopedDb(this.connectionString);

    const rows = await db
      .select()
      .from(adjustments)
      .where(and(inArray(adjustments.transactionId, transactionIds), eq(adjustments.ownerId, this.ownerId)));

    return rows.map(rowToAdjustment);
  }
}
