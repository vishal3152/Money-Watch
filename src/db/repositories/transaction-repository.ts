import { and, asc, count, desc, eq, inArray, like, sql } from "drizzle-orm";

import type { DrizzleDb } from "@/db/client";
import type { Transaction } from "@/domain/transaction";
import { TransactionNotEditableError, TransactionNotFoundError, runDatabaseWrite } from "@/db/errors";
import { likeContainsPattern } from "@/db/like-pattern";
import type {
  AccountBalanceTotal,
  TransactionPage,
  TransactionPageQuery,
  TransactionRepositoryPort,
  TransactionUpdateInput
} from "@/db/repositories/ports";
import { adjustments, transactions } from "@/db/schema";
import { assertMinorUnits } from "@/domain/money";
import { normalizeTransactionTimestamp } from "@/domain/transaction";

function toTransaction(row: {
  id: string;
  accountId: string;
  amountMinor: number;
  occurredAt: string;
  description: string;
  trustStatus: Transaction["trustStatus"];
  transferId: string | null;
  category: string | null;
  importBatchId: string | null;
  externalRef: string | null;
  possibleDuplicateOfTransactionId: string | null;
}): Transaction {
  return {
    id: row.id,
    accountId: row.accountId,
    amountMinor: row.amountMinor,
    occurredAt: row.occurredAt,
    description: row.description,
    trustStatus: row.trustStatus,
    transferId: row.transferId,
    category: row.category as Transaction["category"],
    importBatchId: row.importBatchId,
    externalRef: row.externalRef,
    possibleDuplicateOfTransactionId: row.possibleDuplicateOfTransactionId
  };
}

/** Shared by the page query and its empty-page fallback count, so both filter identically. */
function ledgerConditions(accountId: string, query: TransactionPageQuery) {
  const conditions = [eq(transactions.accountId, accountId)];

  if (query.search && query.search.trim().length > 0) {
    conditions.push(
      sql`lower(${transactions.description}) like ${likeContainsPattern(query.search.trim())} escape '\\'`
    );
  }

  if (query.month && query.month.length > 0) {
    conditions.push(like(transactions.occurredAt, `${query.month}-%`));
  }

  return conditions;
}

export class TransactionRepository implements TransactionRepositoryPort {
  constructor(private readonly db: DrizzleDb) {}

  async create(input: Transaction): Promise<Transaction> {
    assertMinorUnits(input.amountMinor);

    const transaction = {
      ...input,
      occurredAt: normalizeTransactionTimestamp(input.occurredAt)
    };

    await runDatabaseWrite(() =>
      this.db.insert(transactions).values({
        id: transaction.id,
        accountId: transaction.accountId,
        amountMinor: transaction.amountMinor,
        occurredAt: transaction.occurredAt,
        description: transaction.description,
        trustStatus: transaction.trustStatus,
        transferId: transaction.transferId,
        category: transaction.category,
        importBatchId: transaction.importBatchId,
        externalRef: transaction.externalRef ?? null,
        possibleDuplicateOfTransactionId: transaction.possibleDuplicateOfTransactionId ?? null
      })
    );

    return transaction;
  }

  async getById(transactionId: string): Promise<Transaction | null> {
    const row = await this.db.query.transactions.findFirst({
      where: eq(transactions.id, transactionId)
    });

    return row ? toTransaction(row) : null;
  }

  async listByAccountId(accountId: string): Promise<Transaction[]> {
    const rows = await this.db.query.transactions.findMany({
      where: eq(transactions.accountId, accountId),
      orderBy: [asc(transactions.occurredAt), asc(transactions.id)]
    });

    return rows.map(toTransaction);
  }

  async listPageByAccountId(accountId: string, query: TransactionPageQuery): Promise<TransactionPage> {
    const rows = await this.db
      .select({
        id: transactions.id,
        accountId: transactions.accountId,
        amountMinor: transactions.amountMinor,
        occurredAt: transactions.occurredAt,
        description: transactions.description,
        trustStatus: transactions.trustStatus,
        transferId: transactions.transferId,
        category: transactions.category,
        importBatchId: transactions.importBatchId,
        externalRef: transactions.externalRef,
        possibleDuplicateOfTransactionId: transactions.possibleDuplicateOfTransactionId,
        // Windowed count rather than a second COUNT query: the page and its
        // total come back in one round trip, which is the cost that matters
        // against a remote database.
        total: sql<number>`count(*) over ()`
      })
      .from(transactions)
      .where(and(...ledgerConditions(accountId, query)))
      .orderBy(asc(transactions.occurredAt), asc(transactions.id))
      .limit(query.limit)
      .offset(query.offset);

    return {
      rows: rows.map(toTransaction),
      total: rows[0] ? Number(rows[0].total) : await this.countFilteredByAccountId(accountId, query)
    };
  }

  /**
   * Only reached when the requested page is empty — either past the end of a
   * non-empty result, where `count(*) over ()` returns no row to read the total
   * from, or a genuinely empty ledger.
   */
  private async countFilteredByAccountId(accountId: string, query: TransactionPageQuery): Promise<number> {
    const [row] = await this.db
      .select({ total: count() })
      .from(transactions)
      .where(and(...ledgerConditions(accountId, query)));

    return row?.total ?? 0;
  }

  async countByAccountId(accountId: string): Promise<number> {
    const [row] = await this.db
      .select({ total: count() })
      .from(transactions)
      .where(eq(transactions.accountId, accountId));

    return row?.total ?? 0;
  }

  async listMonthsByAccountId(accountId: string): Promise<string[]> {
    const rows = await this.db
      .selectDistinct({ month: sql<string>`substr(${transactions.occurredAt}, 1, 7)` })
      .from(transactions)
      .where(eq(transactions.accountId, accountId))
      .orderBy(desc(sql`substr(${transactions.occurredAt}, 1, 7)`));

    return rows.map((row) => row.month);
  }

  async sumAmountsByAccountIds(accountIds: string[]): Promise<AccountBalanceTotal[]> {
    if (accountIds.length === 0) {
      return [];
    }

    return this.db
      .select({
        accountId: transactions.accountId,
        balanceMinor: sql<number>`coalesce(sum(${transactions.amountMinor}), 0)`
      })
      .from(transactions)
      .where(inArray(transactions.accountId, accountIds))
      .groupBy(transactions.accountId);
  }

  // A Transaction is editable/deletable when it's still Imported (pre-confirmation
  // review) or when it's a manually-entered Confirmed row: no transferId (a
  // Transfer's own edit/delete owns that projection) and not referenced by an
  // Adjustment (which corrects a specific Discrepancy, not a free-standing entry).
  private async assertEditable(existing: { id: string; trustStatus: string; transferId: string | null }) {
    if (existing.trustStatus === "Imported") {
      return;
    }
    if (existing.transferId !== null) {
      throw new TransactionNotEditableError("transfer");
    }
    const adjustment = await this.db.query.adjustments.findFirst({
      where: eq(adjustments.transactionId, existing.id)
    });
    if (adjustment) {
      throw new TransactionNotEditableError("adjustment");
    }
  }

  async update(id: string, fields: TransactionUpdateInput): Promise<Transaction> {
    const existing = await this.db.query.transactions.findFirst({
      where: eq(transactions.id, id)
    });

    if (!existing) {
      throw new TransactionNotFoundError(id);
    }
    await this.assertEditable(existing);
    if (fields.amountMinor !== undefined) {
      assertMinorUnits(fields.amountMinor);
    }

    const occurredAt =
      fields.occurredAt !== undefined ? normalizeTransactionTimestamp(fields.occurredAt) : existing.occurredAt;

    await runDatabaseWrite(() =>
      this.db
        .update(transactions)
        .set({
          amountMinor: fields.amountMinor ?? existing.amountMinor,
          description: fields.description ?? existing.description,
          category: fields.category !== undefined ? fields.category : existing.category,
          occurredAt
        })
        .where(eq(transactions.id, id))
    );

    return toTransaction({
      ...existing,
      amountMinor: fields.amountMinor ?? existing.amountMinor,
      description: fields.description ?? existing.description,
      category: fields.category !== undefined ? fields.category : existing.category,
      occurredAt
    });
  }

  async delete(id: string): Promise<void> {
    const existing = await this.db.query.transactions.findFirst({
      where: eq(transactions.id, id)
    });

    if (!existing) {
      return;
    }
    await this.assertEditable(existing);

    await runDatabaseWrite(() => this.db.delete(transactions).where(eq(transactions.id, id)));
  }

  async dismissSuspectedDuplicate(id: string): Promise<Transaction> {
    const existing = await this.db.query.transactions.findFirst({
      where: eq(transactions.id, id)
    });

    if (!existing) {
      throw new TransactionNotFoundError(id);
    }

    await runDatabaseWrite(() =>
      this.db.update(transactions).set({ possibleDuplicateOfTransactionId: null }).where(eq(transactions.id, id))
    );

    return toTransaction({ ...existing, possibleDuplicateOfTransactionId: null });
  }
}
