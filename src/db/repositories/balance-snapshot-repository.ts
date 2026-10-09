import { asc, eq } from "drizzle-orm";

import type { BalanceSnapshot } from "@/domain/balance-snapshot";
import type { DrizzleDb } from "@/db/client";
import { runDatabaseWrite } from "@/db/errors";
import type { BalanceSnapshotRepositoryPort } from "@/db/repositories/ports";
import { balanceSnapshots } from "@/db/schema";
import { assertMinorUnits } from "@/domain/money";

export class BalanceSnapshotRepository implements BalanceSnapshotRepositoryPort {
  constructor(private readonly db: DrizzleDb) {}

  async create(input: BalanceSnapshot): Promise<BalanceSnapshot> {
    assertMinorUnits(input.balanceMinor);

    await runDatabaseWrite(() =>
      this.db.insert(balanceSnapshots).values({
        id: input.id,
        accountId: input.accountId,
        asOfDate: input.asOfDate,
        balanceMinor: input.balanceMinor
      })
    );

    return input;
  }

  async getById(snapshotId: string): Promise<BalanceSnapshot | null> {
    const row = await this.db.query.balanceSnapshots.findFirst({
      where: eq(balanceSnapshots.id, snapshotId)
    });

    if (!row) {
      return null;
    }

    return {
      id: row.id,
      accountId: row.accountId,
      asOfDate: row.asOfDate,
      balanceMinor: row.balanceMinor
    };
  }

  async listByAccountId(accountId: string): Promise<BalanceSnapshot[]> {
    const rows = await this.db.query.balanceSnapshots.findMany({
      where: eq(balanceSnapshots.accountId, accountId),
      orderBy: [asc(balanceSnapshots.asOfDate), asc(balanceSnapshots.id)]
    });

    return rows.map((row) => ({
      id: row.id,
      accountId: row.accountId,
      asOfDate: row.asOfDate,
      balanceMinor: row.balanceMinor
    }));
  }
}
