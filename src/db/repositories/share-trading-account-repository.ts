import { asc, eq } from "drizzle-orm";

import type { ShareTradingAccount } from "@/domain/share-trading-account";
import type { DrizzleDb } from "@/db/client";
import { EntityHasDependentsError, ShareTradingAccountNotFoundError, runDatabaseWrite } from "@/db/errors";
import type {
  ShareTradingAccountDependentCounts,
  ShareTradingAccountRepositoryPort,
  ShareTradingAccountUpdateInput
} from "@/db/repositories/ports";
import { shareTradingAccounts, stockImportBatches, stockTransactions } from "@/db/schema";

export class ShareTradingAccountRepository implements ShareTradingAccountRepositoryPort {
  constructor(private readonly db: DrizzleDb) {}

  async create(input: ShareTradingAccount): Promise<ShareTradingAccount> {
    await runDatabaseWrite(() =>
      this.db.insert(shareTradingAccounts).values({
        id: input.id,
        institutionId: input.institutionId,
        name: input.name,
        accountNumber: input.accountNumber,
        currencyCode: input.currencyCode
      })
    );

    return input;
  }

  async getById(shareTradingAccountId: string): Promise<ShareTradingAccount | null> {
    const row = await this.db.query.shareTradingAccounts.findFirst({
      where: eq(shareTradingAccounts.id, shareTradingAccountId)
    });

    if (!row) {
      return null;
    }

    return {
      id: row.id,
      institutionId: row.institutionId,
      name: row.name,
      accountNumber: row.accountNumber ?? null,
      currencyCode: row.currencyCode
    };
  }

  async listAll(): Promise<ShareTradingAccount[]> {
    const rows = await this.db.query.shareTradingAccounts.findMany({
      orderBy: [asc(shareTradingAccounts.id)]
    });

    return rows.map((row) => ({
      id: row.id,
      institutionId: row.institutionId,
      name: row.name,
      accountNumber: row.accountNumber ?? null,
      currencyCode: row.currencyCode
    }));
  }

  async listByInstitutionId(institutionId: string): Promise<ShareTradingAccount[]> {
    const rows = await this.db.query.shareTradingAccounts.findMany({
      where: eq(shareTradingAccounts.institutionId, institutionId),
      orderBy: [asc(shareTradingAccounts.id)]
    });

    return rows.map((row) => ({
      id: row.id,
      institutionId: row.institutionId,
      name: row.name,
      accountNumber: row.accountNumber ?? null,
      currencyCode: row.currencyCode
    }));
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

    await runDatabaseWrite(() =>
      this.db
        .update(shareTradingAccounts)
        .set({ name, accountNumber })
        .where(eq(shareTradingAccounts.id, shareTradingAccountId))
    );

    return { ...existing, name, accountNumber };
  }

  async getDependentCounts(shareTradingAccountId: string): Promise<ShareTradingAccountDependentCounts> {
    const [stockTransactionRows, stockImportBatchRows] = await Promise.all([
      this.db.query.stockTransactions.findMany({
        where: eq(stockTransactions.shareTradingAccountId, shareTradingAccountId)
      }),
      this.db.query.stockImportBatches.findMany({
        where: eq(stockImportBatches.shareTradingAccountId, shareTradingAccountId)
      })
    ]);

    return {
      stockTransactions: stockTransactionRows.length,
      stockImportBatches: stockImportBatchRows.length
    };
  }

  async delete(shareTradingAccountId: string): Promise<void> {
    const dependents = await this.getDependentCounts(shareTradingAccountId);
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

    await runDatabaseWrite(() =>
      this.db.delete(shareTradingAccounts).where(eq(shareTradingAccounts.id, shareTradingAccountId))
    );
  }
}
