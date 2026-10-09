import { and, asc, eq } from "drizzle-orm";

import { getScopedDb } from "@/db/postgres/scoped-db";
import { balanceSnapshots } from "@/db/postgres/schema";
import type { BalanceSnapshotRepositoryPort } from "@/db/repositories/ports";
import type { BalanceSnapshot } from "@/domain/balance-snapshot";
import { assertMinorUnits } from "@/domain/money";

function rowToBalanceSnapshot(row: typeof balanceSnapshots.$inferSelect): BalanceSnapshot {
  return {
    id: row.id,
    accountId: row.accountId,
    asOfDate: row.asOfDate,
    balanceMinor: row.balanceMinor
  };
}

export class PgBalanceSnapshotRepository implements BalanceSnapshotRepositoryPort {
  constructor(
    private readonly connectionString: string,
    private readonly ownerId: string
  ) {}

  async create(input: BalanceSnapshot): Promise<BalanceSnapshot> {
    assertMinorUnits(input.balanceMinor);
    const db = getScopedDb(this.connectionString);

    await db.insert(balanceSnapshots).values({
      id: input.id,
      ownerId: this.ownerId,
      accountId: input.accountId,
      asOfDate: input.asOfDate,
      balanceMinor: input.balanceMinor
    });

    return input;
  }

  async getById(snapshotId: string): Promise<BalanceSnapshot | null> {
    const db = getScopedDb(this.connectionString);

    const rows = await db
      .select()
      .from(balanceSnapshots)
      .where(and(eq(balanceSnapshots.id, snapshotId), eq(balanceSnapshots.ownerId, this.ownerId)));

    const row = rows[0];
    return row ? rowToBalanceSnapshot(row) : null;
  }

  async listByAccountId(accountId: string): Promise<BalanceSnapshot[]> {
    const db = getScopedDb(this.connectionString);

    const rows = await db
      .select()
      .from(balanceSnapshots)
      .where(and(eq(balanceSnapshots.accountId, accountId), eq(balanceSnapshots.ownerId, this.ownerId)))
      .orderBy(asc(balanceSnapshots.asOfDate), asc(balanceSnapshots.id));

    return rows.map(rowToBalanceSnapshot);
  }
}
