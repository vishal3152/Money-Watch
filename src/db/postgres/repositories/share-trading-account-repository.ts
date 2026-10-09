import { and, asc, count, eq } from "drizzle-orm";

import type { ShareTradingAccount } from "@/domain/share-trading-account";
import { EntityHasDependentsError, ShareTradingAccountNotFoundError } from "@/db/errors";
import { getScopedDb } from "@/db/postgres/scoped-db";
import { shareTradingAccounts, stockImportBatches, stockTransactions } from "@/db/postgres/schema";
import type {
  ShareTradingAccountDependentCounts,
  ShareTradingAccountRepositoryPort,
  ShareTradingAccountUpdateInput
} from "@/db/repositories/ports";

function rowToShareTradingAccount(row: typeof shareTradingAccounts.$inferSelect): ShareTradingAccount {
  return {
    id: row.id,
    institutionId: row.institutionId,
    name: row.name,
    accountNumber: row.accountNumber ?? null,
    currencyCode: row.currencyCode
  };
}

export class PgShareTradingAccountRepository implements ShareTradingAccountRepositoryPort {
  constructor(
    private readonly connectionString: string,
    private readonly ownerId: string
  ) {}

  async create(input: ShareTradingAccount): Promise<ShareTradingAccount> {
    const db = getScopedDb(this.connectionString);

    await db.insert(shareTradingAccounts).values({
      id: input.id,
      ownerId: this.ownerId,
      institutionId: input.institutionId,
      name: input.name,
      accountNumber: input.accountNumber,
      currencyCode: input.currencyCode
    });

    return input;
  }

  async getById(shareTradingAccountId: string): Promise<ShareTradingAccount | null> {
    const db = getScopedDb(this.connectionString);

    const rows = await db
      .select()
      .from(shareTradingAccounts)
      .where(and(eq(shareTradingAccounts.id, shareTradingAccountId), eq(shareTradingAccounts.ownerId, this.ownerId)));

    const row = rows[0];
    return row ? rowToShareTradingAccount(row) : null;
  }

  async listAll(): Promise<ShareTradingAccount[]> {
    const db = getScopedDb(this.connectionString);

    const rows = await db
      .select()
      .from(shareTradingAccounts)
      .where(eq(shareTradingAccounts.ownerId, this.ownerId))
      .orderBy(asc(shareTradingAccounts.id));

    return rows.map(rowToShareTradingAccount);
  }

  async listByInstitutionId(institutionId: string): Promise<ShareTradingAccount[]> {
    const db = getScopedDb(this.connectionString);

    const rows = await db
      .select()
      .from(shareTradingAccounts)
      .where(
        and(eq(shareTradingAccounts.institutionId, institutionId), eq(shareTradingAccounts.ownerId, this.ownerId))
      )
      .orderBy(asc(shareTradingAccounts.id));

    return rows.map(rowToShareTradingAccount);
  }

  async update(
    shareTradingAccountId: string,
    fields: ShareTradingAccountUpdateInput
  ): Promise<ShareTradingAccount> {
    const existing = await this.getById(shareTradingAccountId);

    if (!existing) {
      throw new ShareTradingAccountNotFoundError(shareTradingAccountId);
    }

    const name = fields.name ?? existing.name;
    const accountNumber =
      fields.accountNumber !== undefined ? fields.accountNumber : existing.accountNumber;
    const db = getScopedDb(this.connectionString);

    await db
      .update(shareTradingAccounts)
      .set({ name, accountNumber })
      .where(
        and(eq(shareTradingAccounts.id, shareTradingAccountId), eq(shareTradingAccounts.ownerId, this.ownerId))
      );

    return { ...existing, name, accountNumber };
  }

  async getDependentCounts(shareTradingAccountId: string): Promise<ShareTradingAccountDependentCounts> {
    const db = getScopedDb(this.connectionString);

    return countDependents(db, shareTradingAccountId, this.ownerId);
  }

  async delete(shareTradingAccountId: string): Promise<void> {
    const db = getScopedDb(this.connectionString);

    await db.transaction(async (tx) => {
      const dependents = await countDependents(tx, shareTradingAccountId, this.ownerId);

      const parts: string[] = [];
      if (dependents.stockTransactions > 0) {
        parts.push(
          `${dependents.stockTransactions} Stock Transaction${dependents.stockTransactions === 1 ? "" : "s"}`
        );
      }
      if (dependents.stockImportBatches > 0) {
        parts.push(
          `${dependents.stockImportBatches} Stock Import Batch${dependents.stockImportBatches === 1 ? "" : "es"}`
        );
      }

      if (parts.length > 0) {
        throw new EntityHasDependentsError(
          `This Share Trading Account still has ${parts.join(", ")}. Delete those first.`
        );
      }

      await tx
        .delete(shareTradingAccounts)
        .where(
          and(eq(shareTradingAccounts.id, shareTradingAccountId), eq(shareTradingAccounts.ownerId, this.ownerId))
        );
    });
  }
}

// Counts only -- selecting full rows to read `.length` would ship every dependent
// StockTransaction/StockImportBatch row over the wire just to discard it.
async function countDependents(
  db: Pick<ReturnType<typeof getScopedDb>, "select">,
  shareTradingAccountId: string,
  ownerId: string
): Promise<ShareTradingAccountDependentCounts> {
  const [[stockTransactionCount], [stockImportBatchCount]] = await Promise.all([
    db
      .select({ value: count() })
      .from(stockTransactions)
      .where(
        and(eq(stockTransactions.shareTradingAccountId, shareTradingAccountId), eq(stockTransactions.ownerId, ownerId))
      ),
    db
      .select({ value: count() })
      .from(stockImportBatches)
      .where(
        and(
          eq(stockImportBatches.shareTradingAccountId, shareTradingAccountId),
          eq(stockImportBatches.ownerId, ownerId)
        )
      )
  ]);

  return {
    stockTransactions: stockTransactionCount.value,
    stockImportBatches: stockImportBatchCount.value
  };
}
