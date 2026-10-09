import { asc, eq } from "drizzle-orm";

import type { Institution } from "@/domain/institution";
import type { DrizzleDb } from "@/db/client";
import { EntityHasDependentsError, InstitutionNotFoundError, runDatabaseWrite } from "@/db/errors";
import type { InstitutionRepositoryPort, InstitutionUpdateInput } from "@/db/repositories/ports";
import { accounts, fixedDeposits, institutions, shareTradingAccounts } from "@/db/schema";

export type InstitutionDependentCounts = {
  accounts: number;
  fixedDeposits: number;
  shareTradingAccounts: number;
};

export class InstitutionRepository implements InstitutionRepositoryPort {
  constructor(private readonly db: DrizzleDb) {}

  async create(input: Institution): Promise<Institution> {
    await runDatabaseWrite(() =>
      this.db.insert(institutions).values({
        id: input.id,
        name: input.name
      })
    );

    return input;
  }

  async getById(institutionId: string): Promise<Institution | null> {
    const row = await this.db.query.institutions.findFirst({
      where: eq(institutions.id, institutionId)
    });

    if (!row) {
      return null;
    }

    return {
      id: row.id,
      name: row.name
    };
  }

  async listAll(): Promise<Institution[]> {
    const rows = await this.db.query.institutions.findMany({
      orderBy: [asc(institutions.id)]
    });

    return rows.map((row) => ({
      id: row.id,
      name: row.name
    }));
  }

  async update(institutionId: string, fields: InstitutionUpdateInput): Promise<Institution> {
    const existing = await this.getById(institutionId);

    if (!existing) {
      throw new InstitutionNotFoundError(institutionId);
    }

    const name = fields.name ?? existing.name;

    await runDatabaseWrite(() =>
      this.db.update(institutions).set({ name }).where(eq(institutions.id, institutionId))
    );

    return { id: institutionId, name };
  }

  async getDependentCounts(institutionId: string): Promise<InstitutionDependentCounts> {
    const [accountRows, fixedDepositRows, shareTradingAccountRows] = await Promise.all([
      this.db.query.accounts.findMany({ where: eq(accounts.institutionId, institutionId) }),
      this.db.query.fixedDeposits.findMany({ where: eq(fixedDeposits.institutionId, institutionId) }),
      this.db.query.shareTradingAccounts.findMany({
        where: eq(shareTradingAccounts.institutionId, institutionId)
      })
    ]);

    return {
      accounts: accountRows.length,
      fixedDeposits: fixedDepositRows.length,
      shareTradingAccounts: shareTradingAccountRows.length
    };
  }

  async delete(institutionId: string): Promise<void> {
    const dependents = await this.getDependentCounts(institutionId);
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

    await runDatabaseWrite(() =>
      this.db.delete(institutions).where(eq(institutions.id, institutionId))
    );
  }
}
