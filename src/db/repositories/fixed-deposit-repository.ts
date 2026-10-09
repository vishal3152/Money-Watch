import { asc, eq } from "drizzle-orm";

import type { DrizzleDb } from "@/db/client";
import type { FixedDeposit } from "@/domain/fixed-deposit";
import { FixedDepositCurrencyMismatchError, FixedDepositInstitutionMismatchError, runDatabaseWrite } from "@/db/errors";
import { AccountRepository } from "@/db/repositories/account-repository";
import type { FixedDepositOpeningDebit, FixedDepositRepositoryPort } from "@/db/repositories/ports";
import { fixedDeposits, transactions, transfers } from "@/db/schema";
import { assertMinorUnits, InvalidMinorUnitsError } from "@/domain/money";
import { normalizeTransactionTimestamp } from "@/domain/transaction";

export class FixedDepositRepository implements FixedDepositRepositoryPort {
  constructor(private readonly db: DrizzleDb) {}

  async create(
    input: FixedDeposit,
    openingDebit?: FixedDepositOpeningDebit
  ): Promise<FixedDeposit> {
    assertMinorUnits(input.principalMinor);
    assertMinorUnits(input.originalPrincipalMinor);
    if (input.principalMinor <= 0 || input.originalPrincipalMinor <= 0) {
      throw new InvalidMinorUnitsError();
    }

    const linkedAccount = await new AccountRepository(this.db).getById(input.linkedAccountId);
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

    await runDatabaseWrite(() =>
      Promise.resolve(
        this.db.transaction((tx) => {
          tx.insert(fixedDeposits)
            .values({
              id: input.id,
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
            })
            .run();

          if (openingDebit) {
            const occurredAt = normalizeTransactionTimestamp(input.openedDate);

            tx.insert(transfers)
              .values({
                id: openingDebit.transferId,
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
              })
              .run();

            tx.insert(transactions)
              .values({
                id: openingDebit.transactionId,
                accountId: input.linkedAccountId,
                amountMinor: -input.principalMinor,
                occurredAt,
                description: openingDebit.description,
                trustStatus: "Confirmed",
                transferId: openingDebit.transferId
              })
              .run();
          }
        })
      )
    );

    return input;
  }

  async getById(fixedDepositId: string): Promise<FixedDeposit | null> {
    const row = await this.db.query.fixedDeposits.findFirst({
      where: eq(fixedDeposits.id, fixedDepositId)
    });

    if (!row) {
      return null;
    }

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

  async listAll(): Promise<FixedDeposit[]> {
    const rows = await this.db.query.fixedDeposits.findMany({
      orderBy: [asc(fixedDeposits.id)]
    });

    return rows.map(toFixedDeposit);
  }

  async listByInstitutionId(institutionId: string): Promise<FixedDeposit[]> {
    const rows = await this.db.query.fixedDeposits.findMany({
      where: eq(fixedDeposits.institutionId, institutionId),
      orderBy: [asc(fixedDeposits.id)]
    });

    return rows.map(toFixedDeposit);
  }
}

function toFixedDeposit(row: {
  id: string;
  name: string;
  accountNumber: string | null;
  institutionId: string;
  linkedAccountId: string;
  principalMinor: number;
  originalPrincipalMinor: number;
  currencyCode: string;
  interestRateBps: number;
  openedDate: string;
  maturityDate: string;
  status: FixedDeposit["status"];
}): FixedDeposit {
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
