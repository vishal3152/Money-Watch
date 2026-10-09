import { eq, inArray } from "drizzle-orm";

import type { Adjustment } from "@/domain/adjustment";
import type { DrizzleDb } from "@/db/client";
import { runDatabaseWrite } from "@/db/errors";
import type { AdjustmentRepositoryPort, CreateAdjustmentTransactionInput } from "@/db/repositories/ports";
import { adjustments, transactions } from "@/db/schema";
import { assertMinorUnits } from "@/domain/money";
import { normalizeTransactionTimestamp } from "@/domain/transaction";

export type { CreateAdjustmentTransactionInput } from "@/db/repositories/ports";

export class AdjustmentRepository implements AdjustmentRepositoryPort {
  constructor(private readonly db: DrizzleDb) {}

  async create(transaction: CreateAdjustmentTransactionInput, discrepancyId: string): Promise<Adjustment> {
    assertMinorUnits(transaction.amountMinor);

    const occurredAt = normalizeTransactionTimestamp(transaction.occurredAt);
    const adjustment: Adjustment = {
      id: `${transaction.id}-adjustment`,
      transactionId: transaction.id,
      discrepancyId
    };

    await runDatabaseWrite(async () =>
      this.db.transaction((tx) => {
        tx.insert(transactions)
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

        tx.insert(adjustments)
          .values({
            id: adjustment.id,
            transactionId: adjustment.transactionId,
            discrepancyId: adjustment.discrepancyId
          })
          .run();
      })
    );

    return adjustment;
  }

  async getByDiscrepancyId(discrepancyId: string): Promise<Adjustment | null> {
    const row = await this.db.query.adjustments.findFirst({
      where: eq(adjustments.discrepancyId, discrepancyId)
    });

    if (!row) {
      return null;
    }

    return {
      id: row.id,
      transactionId: row.transactionId,
      discrepancyId: row.discrepancyId
    };
  }

  async getByTransactionId(transactionId: string): Promise<Adjustment | null> {
    const row = await this.db.query.adjustments.findFirst({
      where: eq(adjustments.transactionId, transactionId)
    });

    if (!row) {
      return null;
    }

    return {
      id: row.id,
      transactionId: row.transactionId,
      discrepancyId: row.discrepancyId
    };
  }

  async listByTransactionIds(transactionIds: string[]): Promise<Adjustment[]> {
    if (transactionIds.length === 0) {
      return [];
    }

    const rows = await this.db.query.adjustments.findMany({
      where: inArray(adjustments.transactionId, transactionIds)
    });

    return rows.map((row) => ({
      id: row.id,
      transactionId: row.transactionId,
      discrepancyId: row.discrepancyId
    }));
  }
}
