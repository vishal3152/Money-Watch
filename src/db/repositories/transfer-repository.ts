import { and, asc, count, eq, or, sql } from "drizzle-orm";

import type { DrizzleDb } from "@/db/client";
import {
  DatabaseConstraintError,
  FixedDepositTransferError,
  TransferCurrencyMismatchError,
  TransferNotEditableError,
  TransferNotFoundError,
  runDatabaseWrite
} from "@/db/errors";
import { AccountRepository } from "@/db/repositories/account-repository";
import { FixedDepositRepository } from "@/db/repositories/fixed-deposit-repository";
import type { AccountTransferImpact, TransferRepositoryPort } from "@/db/repositories/ports";
import { accounts, fixedDeposits, transactions, transfers } from "@/db/schema";
import { assertMinorUnits } from "@/domain/money";
import { normalizeTransactionTimestamp } from "@/domain/transaction";
import {
  assertValidTransferAmounts,
  assertValidTransferLegs,
  assertValidTransferPurpose,
  type Transfer,
  type TransferPurpose
} from "@/domain/transfer";
import type { FixedDepositStatus } from "@/domain/fixed-deposit";

type DrizzleTransaction = Parameters<Parameters<DrizzleDb["transaction"]>[0]>[0];

export class TransferRepository implements TransferRepositoryPort {
  constructor(private readonly db: DrizzleDb) {}

  async create(input: Transfer): Promise<Transfer> {
    const transfer = { ...input, occurredAt: normalizeTransactionTimestamp(input.occurredAt) };

    await this.validateTransferInvariants(transfer);

    await runDatabaseWrite(async () =>
      this.db.transaction((tx) => {
        tx.insert(transfers)
          .values({
            id: transfer.id,
            sourceAccountId: transfer.sourceAccountId,
            sourceFixedDepositId: transfer.sourceFixedDepositId,
            sourceAmountMinor: transfer.sourceAmountMinor,
            sourceCurrencyCode: transfer.sourceCurrencyCode,
            destinationAccountId: transfer.destinationAccountId,
            destinationFixedDepositId: transfer.destinationFixedDepositId,
            destinationAmountMinor: transfer.destinationAmountMinor,
            destinationCurrencyCode: transfer.destinationCurrencyCode,
            occurredAt: transfer.occurredAt,
            description: transfer.description,
            purpose: transfer.purpose
          })
          .run();

        this.insertLinkedTransactions(tx, transfer);
        this.applyFixedDepositSideEffects(tx, transfer);
      })
    );

    return transfer;
  }

  async update(transferId: string, input: Omit<Transfer, "id">): Promise<Transfer> {
    const existing = await this.getById(transferId);
    if (!existing) {
      throw new TransferNotFoundError(transferId);
    }
    if (existing.purpose === "fixed-deposit-opening" || input.purpose === "fixed-deposit-opening") {
      throw new TransferNotEditableError();
    }

    const transfer: Transfer = {
      ...input,
      id: transferId,
      occurredAt: normalizeTransactionTimestamp(input.occurredAt)
    };

    await this.validateTransferInvariants(transfer, existing);

    const affectedFixedDepositIds = new Set(
      [
        existing.sourceFixedDepositId,
        existing.destinationFixedDepositId,
        transfer.sourceFixedDepositId,
        transfer.destinationFixedDepositId
      ].filter((id): id is string => id !== null)
    );

    await runDatabaseWrite(async () =>
      this.db.transaction((tx) => {
        tx.delete(transactions).where(eq(transactions.transferId, transferId)).run();
        tx.update(transfers)
          .set({
            sourceAccountId: transfer.sourceAccountId,
            sourceFixedDepositId: transfer.sourceFixedDepositId,
            sourceAmountMinor: transfer.sourceAmountMinor,
            sourceCurrencyCode: transfer.sourceCurrencyCode,
            destinationAccountId: transfer.destinationAccountId,
            destinationFixedDepositId: transfer.destinationFixedDepositId,
            destinationAmountMinor: transfer.destinationAmountMinor,
            destinationCurrencyCode: transfer.destinationCurrencyCode,
            occurredAt: transfer.occurredAt,
            description: transfer.description,
            purpose: transfer.purpose
          })
          .where(eq(transfers.id, transferId))
          .run();

        this.insertLinkedTransactions(tx, transfer);

        // Unlike create()'s incremental +=/-= against current principal,
        // an edit replays the affected Fixed Deposit(s)' full Transfer history
        // from scratch (same approach delete() uses) — the edited transfer
        // may no longer be the most recent one chronologically.
        for (const fixedDepositId of affectedFixedDepositIds) {
          this.recomputeFixedDepositState(tx, fixedDepositId);
        }
      })
    );

    return transfer;
  }

  private async validateTransferInvariants(transfer: Transfer, existing?: Transfer): Promise<void> {
    assertValidTransferLegs(transfer);
    assertValidTransferPurpose(transfer);
    assertValidTransferAmounts(transfer);
    assertMinorUnits(transfer.sourceAmountMinor);
    assertMinorUnits(transfer.destinationAmountMinor);

    const accounts = new AccountRepository(this.db);
    const fixedDepositRepository = new FixedDepositRepository(this.db);

    if (transfer.sourceAccountId) {
      const account = await accounts.getById(transfer.sourceAccountId);
      if (account && account.currencyCode !== transfer.sourceCurrencyCode) {
        throw new TransferCurrencyMismatchError(
          `Transfer source currency must match the Account's currency (${account.currencyCode}).`
        );
      }
    }

    if (transfer.destinationAccountId) {
      const account = await accounts.getById(transfer.destinationAccountId);
      if (account && account.currencyCode !== transfer.destinationCurrencyCode) {
        throw new TransferCurrencyMismatchError(
          `Transfer destination currency must match the Account's currency (${account.currencyCode}).`
        );
      }
    }

    if (transfer.destinationFixedDepositId) {
      const destination = await fixedDepositRepository.getById(transfer.destinationFixedDepositId);
      if (!destination) {
        throw new DatabaseConstraintError(
          new Error(`Fixed Deposit ${transfer.destinationFixedDepositId} does not exist.`)
        );
      }
      if (destination.currencyCode !== transfer.destinationCurrencyCode) {
        throw new TransferCurrencyMismatchError(
          `Transfer destination currency must match the Fixed Deposit's currency (${destination.currencyCode}).`
        );
      }
      if (destination.status !== "Open") {
        throw new FixedDepositTransferError("Only an Open Fixed Deposit can receive a Transfer.");
      }
      if (transfer.purpose === "fixed-deposit-opening") {
        const existingOpening = await this.db.query.transfers.findFirst({
          where: and(
            eq(transfers.destinationFixedDepositId, transfer.destinationFixedDepositId),
            eq(transfers.purpose, "fixed-deposit-opening")
          )
        });
        if (existingOpening) {
          throw new FixedDepositTransferError("A Fixed Deposit can only have one opening Transfer.");
        }
        if (
          transfer.sourceCurrencyCode === transfer.destinationCurrencyCode &&
          transfer.destinationAmountMinor !== destination.originalPrincipalMinor
        ) {
          throw new FixedDepositTransferError(
            "Opening Transfer amount must match the Fixed Deposit original principal."
          );
        }
      }
    }

    if (transfer.sourceFixedDepositId) {
      const source = await fixedDepositRepository.getById(transfer.sourceFixedDepositId);

      if (!source) {
        throw new DatabaseConstraintError(
          new Error(`Fixed Deposit ${transfer.sourceFixedDepositId} does not exist.`)
        );
      }
      if (source.currencyCode !== transfer.sourceCurrencyCode) {
        throw new TransferCurrencyMismatchError(
          `Transfer source currency must match the Fixed Deposit's currency (${source.currencyCode}).`
        );
      }
      // Editing the very Transfer that is already this FixedDeposit's withdrawal source means
      // `source.status`/`source.principalMinor` still reflect that Transfer's OLD amount (the
      // write path replays full history afterwards, but this pre-check runs against the
      // FixedDeposit's currently stored values). Without accounting for that, increasing an
      // existing withdrawal — even while staying within the FD's original principal — looks
      // like an overdraw, and editing the very Transfer that fully closed the FD looks like
      // "not Open", even for a no-op amount change. Treat this Transfer's old effect as already
      // reversed before validating the new one.
      const isEditingSameWithdrawal =
        existing !== undefined &&
        existing.sourceFixedDepositId === transfer.sourceFixedDepositId &&
        existing.purpose === "fixed-deposit-withdrawal";
      const effectivePrincipalMinor = isEditingSameWithdrawal
        ? source.principalMinor + existing!.sourceAmountMinor
        : source.principalMinor;

      if (source.status !== "Open" && !isEditingSameWithdrawal) {
        throw new FixedDepositTransferError(
          "Only an Open Fixed Deposit can be used as a Transfer source."
        );
      }
      if (transfer.destinationAccountId !== source.linkedAccountId) {
        throw new FixedDepositTransferError(
          "A Fixed Deposit withdrawal must pay out to its linked Account."
        );
      }
      if (
        transfer.occurredAt.slice(0, 10) < source.maturityDate &&
        transfer.sourceAmountMinor > effectivePrincipalMinor
      ) {
        throw new FixedDepositTransferError(
          "Withdrawal amount cannot exceed the Fixed Deposit current principal."
        );
      }
    }
  }

  private insertLinkedTransactions(tx: DrizzleTransaction, transfer: Transfer): void {
    if (transfer.sourceAccountId) {
      tx.insert(transactions)
        .values({
          id: `${transfer.id}-source`,
          accountId: transfer.sourceAccountId,
          amountMinor: -transfer.sourceAmountMinor,
          occurredAt: transfer.occurredAt,
          description: transfer.description,
          trustStatus: "Confirmed",
          transferId: transfer.id
        })
        .run();
    }

    if (transfer.destinationAccountId) {
      tx.insert(transactions)
        .values({
          id: `${transfer.id}-destination`,
          accountId: transfer.destinationAccountId,
          amountMinor: transfer.destinationAmountMinor,
          occurredAt: transfer.occurredAt,
          description: transfer.description,
          trustStatus: "Confirmed",
          transferId: transfer.id
        })
        .run();
    }
  }

  private applyFixedDepositSideEffects(tx: DrizzleTransaction, transfer: Transfer): void {
    if (transfer.destinationFixedDepositId && transfer.purpose === "fixed-deposit-top-up") {
      const destination = tx
        .select()
        .from(fixedDeposits)
        .where(eq(fixedDeposits.id, transfer.destinationFixedDepositId))
        .get();
      if (!destination || destination.status !== "Open") {
        throw new FixedDepositTransferError("Only an Open Fixed Deposit can receive a top-up.");
      }
      tx.update(fixedDeposits)
        .set({ principalMinor: destination.principalMinor + transfer.destinationAmountMinor })
        .where(eq(fixedDeposits.id, transfer.destinationFixedDepositId))
        .run();
    }

    if (transfer.sourceFixedDepositId && transfer.purpose === "fixed-deposit-withdrawal") {
      const source = tx
        .select()
        .from(fixedDeposits)
        .where(eq(fixedDeposits.id, transfer.sourceFixedDepositId))
        .get();
      if (!source || source.status !== "Open") {
        throw new FixedDepositTransferError(
          "Only an Open Fixed Deposit can be used as a Transfer source."
        );
      }
      const isBeforeMaturity = transfer.occurredAt.slice(0, 10) < source.maturityDate;
      if (isBeforeMaturity && transfer.sourceAmountMinor > source.principalMinor) {
        throw new FixedDepositTransferError(
          "Withdrawal amount cannot exceed the Fixed Deposit current principal."
        );
      }
      const nextPrincipalMinor = Math.max(0, source.principalMinor - transfer.sourceAmountMinor);
      tx.update(fixedDeposits)
        .set({
          principalMinor: nextPrincipalMinor,
          status:
            nextPrincipalMinor === 0
              ? this.closedFixedDepositStatus(source.maturityDate, transfer.occurredAt)
              : "Open"
        })
        .where(eq(fixedDeposits.id, transfer.sourceFixedDepositId))
        .run();
    }
  }

  async getById(transferId: string): Promise<Transfer | null> {
    const row = await this.db.query.transfers.findFirst({
      where: eq(transfers.id, transferId)
    });

    if (!row) {
      return null;
    }

    return {
      id: row.id,
      sourceAccountId: row.sourceAccountId,
      sourceFixedDepositId: row.sourceFixedDepositId,
      sourceAmountMinor: row.sourceAmountMinor,
      sourceCurrencyCode: row.sourceCurrencyCode,
      destinationAccountId: row.destinationAccountId,
      destinationFixedDepositId: row.destinationFixedDepositId,
      destinationAmountMinor: row.destinationAmountMinor,
      destinationCurrencyCode: row.destinationCurrencyCode,
      occurredAt: row.occurredAt,
        description: row.description,
        purpose: row.purpose
    };
  }

  async delete(transferId: string): Promise<void> {
    const transfer = await this.getById(transferId);

    if (!transfer) {
      return;
    }

    await runDatabaseWrite(async () =>
      this.db.transaction((tx) => {
        tx.delete(transactions).where(eq(transactions.transferId, transferId)).run();
        tx.delete(transfers).where(eq(transfers.id, transferId)).run();

        for (const fixedDepositId of [
          transfer.sourceFixedDepositId,
          transfer.destinationFixedDepositId
        ].filter((id): id is string => id !== null)) {
          this.recomputeFixedDepositState(tx, fixedDepositId);
        }
      })
    );
  }

  async listByLeg(accountOrFixedDepositId: string): Promise<Transfer[]> {
    const rows = await this.db.query.transfers.findMany({
      where: or(
        eq(transfers.sourceAccountId, accountOrFixedDepositId),
        eq(transfers.sourceFixedDepositId, accountOrFixedDepositId),
        eq(transfers.destinationAccountId, accountOrFixedDepositId),
        eq(transfers.destinationFixedDepositId, accountOrFixedDepositId)
      ),
      orderBy: [asc(transfers.occurredAt), asc(transfers.id)]
    });

    return rows.map((row) => ({
      id: row.id,
      sourceAccountId: row.sourceAccountId,
      sourceFixedDepositId: row.sourceFixedDepositId,
      sourceAmountMinor: row.sourceAmountMinor,
      sourceCurrencyCode: row.sourceCurrencyCode,
      destinationAccountId: row.destinationAccountId,
      destinationFixedDepositId: row.destinationFixedDepositId,
      destinationAmountMinor: row.destinationAmountMinor,
      destinationCurrencyCode: row.destinationCurrencyCode,
      occurredAt: row.occurredAt,
      description: row.description,
      purpose: row.purpose
    }));
  }

  async getTransferImpactByAccountId(accountId: string): Promise<AccountTransferImpact> {
    const touchesAccount = or(eq(transfers.sourceAccountId, accountId), eq(transfers.destinationAccountId, accountId));

    const [countRow] = await this.db.select({ total: count() }).from(transfers).where(touchesAccount);

    const otherAccountId = sql`case when ${transfers.sourceAccountId} = ${accountId} then ${transfers.destinationAccountId} else ${transfers.sourceAccountId} end`;
    const nameRows = await this.db
      .selectDistinct({ name: accounts.name })
      .from(transfers)
      .innerJoin(accounts, eq(accounts.id, otherAccountId))
      .where(touchesAccount)
      .orderBy(asc(accounts.name));

    return {
      transferCount: countRow?.total ?? 0,
      counterpartyAccountNames: nameRows.map((row) => row.name)
    };
  }

  private closedFixedDepositStatus(
    maturityDate: string,
    occurredAt: string
  ): FixedDepositStatus {
    return occurredAt.slice(0, 10) < maturityDate ? "PrematurelyClosed" : "Matured";
  }

  private recomputeFixedDepositState(tx: DrizzleTransaction, fixedDepositId: string): void {
    const fixedDeposit = tx
      .select()
      .from(fixedDeposits)
      .where(eq(fixedDeposits.id, fixedDepositId))
      .get();
    if (!fixedDeposit) {
      return;
    }

    const relatedTransfers = tx
      .select()
      .from(transfers)
      .where(
        or(
          eq(transfers.sourceFixedDepositId, fixedDepositId),
          eq(transfers.destinationFixedDepositId, fixedDepositId)
        )
      )
      .orderBy(asc(transfers.occurredAt), asc(transfers.id))
      .all();

    let principalMinor = fixedDeposit.originalPrincipalMinor;
    let status: FixedDepositStatus = "Open";

    for (const transfer of relatedTransfers) {
      const purpose = transfer.purpose as TransferPurpose;
      if (
        transfer.destinationFixedDepositId === fixedDepositId &&
        purpose === "fixed-deposit-top-up"
      ) {
        principalMinor += transfer.destinationAmountMinor;
      }
      if (
        transfer.sourceFixedDepositId === fixedDepositId &&
        purpose === "fixed-deposit-withdrawal"
      ) {
        const isBeforeMaturity = transfer.occurredAt.slice(0, 10) < fixedDeposit.maturityDate;
        if (isBeforeMaturity && transfer.sourceAmountMinor > principalMinor) {
          throw new FixedDepositTransferError("Fixed Deposit principal cannot become negative.");
        }
        principalMinor = Math.max(0, principalMinor - transfer.sourceAmountMinor);
        if (principalMinor === 0) {
          status = this.closedFixedDepositStatus(fixedDeposit.maturityDate, transfer.occurredAt);
        }
      }
    }

    if (principalMinor > 0) {
      status = "Open";
    }

    tx.update(fixedDeposits)
      .set({ principalMinor, status })
      .where(eq(fixedDeposits.id, fixedDepositId))
      .run();
  }
}
