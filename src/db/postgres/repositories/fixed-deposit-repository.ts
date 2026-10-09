import { and, asc, eq } from "drizzle-orm";

import { FixedDepositCurrencyMismatchError, FixedDepositInstitutionMismatchError } from "@/db/errors";
import { PgAccountRepository } from "@/db/postgres/repositories/account-repository";
import { getScopedDb } from "@/db/postgres/scoped-db";
import { fixedDeposits, transactions, transfers } from "@/db/postgres/schema";
import type { FixedDepositOpeningDebit, FixedDepositRepositoryPort } from "@/db/repositories/ports";
import type { FixedDeposit } from "@/domain/fixed-deposit";
import { assertMinorUnits, InvalidMinorUnitsError } from "@/domain/money";
import { normalizeTransactionTimestamp } from "@/domain/transaction";

export class PgFixedDepositRepository implements FixedDepositRepositoryPort {
  constructor(
    private readonly connectionString: string,
    private readonly ownerId: string
  ) {}

  async create(input: FixedDeposit, openingDebit?: FixedDepositOpeningDebit): Promise<FixedDeposit> {
    assertMinorUnits(input.principalMinor);
    assertMinorUnits(input.originalPrincipalMinor);
    if (input.principalMinor <= 0 || input.originalPrincipalMinor <= 0) {
      throw new InvalidMinorUnitsError();
    }

    const linkedAccount = await new PgAccountRepository(this.connectionString, this.ownerId).getById(
      input.linkedAccountId
    );

    if (linkedAccount && linkedAccount.currencyCode !== input.currencyCode) {
      throw new FixedDepositCurrencyMismatchError(
        `Fixed Deposit currency must match its linked Account's currency (${linkedAccount.currencyCode}).`
      );
    }
    if (linkedAccount && linkedAccount.institutionId !== input.institutionId) {
      throw new FixedDepositInstitutionMismatchError(
        "Fixed Deposit Institution must match its linked Account's Institution."
      );
    }

    const db = getScopedDb(this.connectionString);

    await db.transaction(async (tx) => {
      await tx.insert(fixedDeposits).values({
        id: input.id,
        ownerId: this.ownerId,
        name: input.name,
        accountNumber: input.accountNumber,
        institutionId: input.institutionId,
        linkedAccountId: input.linkedAccountId,
        principalMinor: input.principalMinor,
        originalPrincipalMinor: input.originalPrincipalMinor,
        currencyCode: input.currencyCode,
        interestRateBps: input.interestRateBps,
        openedDate: input.openedDate,
        maturityDate: input.maturityDate,
        status: input.status
      });

      if (openingDebit) {
        const occurredAt = normalizeTransactionTimestamp(input.openedDate);

        await tx.insert(transfers).values({
          id: openingDebit.transferId,
          ownerId: this.ownerId,
          sourceAccountId: input.linkedAccountId,
          sourceFixedDepositId: null,
          sourceAmountMinor: input.principalMinor,
          sourceCurrencyCode: input.currencyCode,
          destinationAccountId: null,
          destinationFixedDepositId: input.id,
          destinationAmountMinor: input.principalMinor,
          destinationCurrencyCode: input.currencyCode,
          occurredAt,
          description: openingDebit.description,
          purpose: "fixed-deposit-opening"
        });

        await tx.insert(transactions).values({
          id: openingDebit.transactionId,
          ownerId: this.ownerId,
          accountId: input.linkedAccountId,
          amountMinor: -input.principalMinor,
          occurredAt,
          description: openingDebit.description,
          trustStatus: "Confirmed",
          transferId: openingDebit.transferId
        });
      }
    });

    return input;
  }

  async getById(fixedDepositId: string): Promise<FixedDeposit | null> {
    const db = getScopedDb(this.connectionString);

    const rows = await db
      .select()
      .from(fixedDeposits)
      .where(and(eq(fixedDeposits.id, fixedDepositId), eq(fixedDeposits.ownerId, this.ownerId)));

    const row = rows[0];
    if (!row) {
      return null;
    }

    return rowToFixedDeposit(row);
  }

  async listAll(): Promise<FixedDeposit[]> {
    const db = getScopedDb(this.connectionString);

    const rows = await db
      .select()
      .from(fixedDeposits)
      .where(eq(fixedDeposits.ownerId, this.ownerId))
      .orderBy(asc(fixedDeposits.id));

    return rows.map(rowToFixedDeposit);
  }

  async listByInstitutionId(institutionId: string): Promise<FixedDeposit[]> {
    const db = getScopedDb(this.connectionString);

    const rows = await db
      .select()
      .from(fixedDeposits)
      .where(and(eq(fixedDeposits.institutionId, institutionId), eq(fixedDeposits.ownerId, this.ownerId)))
      .orderBy(asc(fixedDeposits.id));

    return rows.map(rowToFixedDeposit);
  }
}

function rowToFixedDeposit(row: typeof fixedDeposits.$inferSelect): FixedDeposit {
  return {
    id: row.id,
    name: row.name,
    accountNumber: row.accountNumber ?? null,
    institutionId: row.institutionId,
    linkedAccountId: row.linkedAccountId,
    principalMinor: row.principalMinor,
    originalPrincipalMinor: row.originalPrincipalMinor,
    currencyCode: row.currencyCode,
    interestRateBps: row.interestRateBps,
    openedDate: row.openedDate,
    maturityDate: row.maturityDate,
    status: row.status
  };
}
