import { and, asc, count, eq } from "drizzle-orm";

import type { Institution } from "@/domain/institution";
import { EntityHasDependentsError, InstitutionNotFoundError } from "@/db/errors";
import { getScopedDb } from "@/db/postgres/scoped-db";
import { accounts, fixedDeposits, institutions, shareTradingAccounts } from "@/db/postgres/schema";
import type {
  InstitutionDependentCounts,
  InstitutionRepositoryPort,
  InstitutionUpdateInput
} from "@/db/repositories/ports";

export class PgInstitutionRepository implements InstitutionRepositoryPort {
  constructor(
    private readonly connectionString: string,
    private readonly ownerId: string
  ) {}

  async create(input: Institution): Promise<Institution> {
    const db = getScopedDb(this.connectionString);

    await db.insert(institutions).values({
      id: input.id,
      ownerId: this.ownerId,
      name: input.name
    });

    return input;
  }

  async getById(institutionId: string): Promise<Institution | null> {
    const db = getScopedDb(this.connectionString);

    const rows = await db
      .select()
      .from(institutions)
      .where(and(eq(institutions.id, institutionId), eq(institutions.ownerId, this.ownerId)));

    const row = rows[0] ?? null;
    return row ? { id: row.id, name: row.name } : null;
  }

  async listAll(): Promise<Institution[]> {
    const db = getScopedDb(this.connectionString);

    const rows = await db
      .select()
      .from(institutions)
      .where(eq(institutions.ownerId, this.ownerId))
      .orderBy(asc(institutions.id));

    return rows.map((row) => ({ id: row.id, name: row.name }));
  }

  async update(institutionId: string, fields: InstitutionUpdateInput): Promise<Institution> {
    const existing = await this.getById(institutionId);

    if (!existing) {
      throw new InstitutionNotFoundError(institutionId);
    }

    const name = fields.name ?? existing.name;
    const db = getScopedDb(this.connectionString);

    await db
      .update(institutions)
      .set({ name })
      .where(and(eq(institutions.id, institutionId), eq(institutions.ownerId, this.ownerId)));

    return { id: institutionId, name };
  }

  async getDependentCounts(institutionId: string): Promise<InstitutionDependentCounts> {
    const db = getScopedDb(this.connectionString);

    return countDependents(db, institutionId, this.ownerId);
  }

  async delete(institutionId: string): Promise<void> {
    const db = getScopedDb(this.connectionString);

    await db.transaction(async (tx) => {
      const dependents = await countDependents(tx, institutionId, this.ownerId);

      const parts: string[] = [];
      if (dependents.accounts > 0) {
        parts.push(`${dependents.accounts} Account${dependents.accounts === 1 ? "" : "s"}`);
      }
      if (dependents.fixedDeposits > 0) {
        parts.push(
          `${dependents.fixedDeposits} Fixed Deposit${dependents.fixedDeposits === 1 ? "" : "s"}`
        );
      }
      if (dependents.shareTradingAccounts > 0) {
        parts.push(
          `${dependents.shareTradingAccounts} Share Trading Account${dependents.shareTradingAccounts === 1 ? "" : "s"}`
        );
      }

      if (parts.length > 0) {
        throw new EntityHasDependentsError(
          `This Institution still has ${parts.join(", ")}. Delete those first.`
        );
      }

      await tx
        .delete(institutions)
        .where(and(eq(institutions.id, institutionId), eq(institutions.ownerId, this.ownerId)));
    });
  }
}

// Counts only -- selecting full rows to read `.length` would ship every
// dependent Account/FixedDeposit row over the wire just to discard it.
async function countDependents(
  db: Pick<ReturnType<typeof getScopedDb>, "select">,
  institutionId: string,
  ownerId: string
): Promise<InstitutionDependentCounts> {
  const [[accountCount], [fixedDepositCount], [shareTradingAccountCount]] = await Promise.all([
    db
      .select({ value: count() })
      .from(accounts)
      .where(and(eq(accounts.institutionId, institutionId), eq(accounts.ownerId, ownerId))),
    db
      .select({ value: count() })
      .from(fixedDeposits)
      .where(and(eq(fixedDeposits.institutionId, institutionId), eq(fixedDeposits.ownerId, ownerId))),
    db
      .select({ value: count() })
      .from(shareTradingAccounts)
      .where(and(eq(shareTradingAccounts.institutionId, institutionId), eq(shareTradingAccounts.ownerId, ownerId)))
  ]);

  return {
    accounts: accountCount.value,
    fixedDeposits: fixedDepositCount.value,
    shareTradingAccounts: shareTradingAccountCount.value
  };
}
