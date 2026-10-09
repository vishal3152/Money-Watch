import type { DrizzleDb } from "@/db/client";
import { AccountRepository } from "@/db/repositories/account-repository";
import { FixedDepositRepository } from "@/db/repositories/fixed-deposit-repository";
import { InstitutionRepository } from "@/db/repositories/institution-repository";
import { TransactionRepository } from "@/db/repositories/transaction-repository";
import { TransferRepository } from "@/db/repositories/transfer-repository";
import type { DemoSeedData } from "@/demo-data/generate-seed-data";
import { parseDecimalToMinorUnits, parsePercentageToBps } from "@/domain/decimal-input";
import type { TransactionCategory } from "@/domain/transaction-category";

export type LoadDemoSeedResult = {
  institutions: number;
  accounts: number;
  fixedDeposits: number;
  transactions: number;
  transfers: number;
};

export async function loadDemoSeedData(
  db: DrizzleDb,
  data: DemoSeedData
): Promise<LoadDemoSeedResult> {
  const institutions = new InstitutionRepository(db);
  const accounts = new AccountRepository(db);
  const transactions = new TransactionRepository(db);
  const fixedDeposits = new FixedDepositRepository(db);
  const transfers = new TransferRepository(db);

  for (const institution of data.institutions) {
    const existing = await institutions.getById(institution.id);
    if (existing) {
      throw new Error(
        `Seed institution "${institution.id}" already exists. Use an empty database (or delete existing demo data) before loading.`
      );
    }
  }

  for (const institution of data.institutions) {
    await institutions.create(institution);
  }

  for (const account of data.accounts) {
    await accounts.create(account);
  }

  for (const txn of data.transactions) {
    const account = await accounts.getById(txn.accountId);
    if (!account) {
      throw new Error(`Missing Account ${txn.accountId} for Transaction ${txn.id}`);
    }
    const magnitude = parseDecimalToMinorUnits(txn.amount, account.currencyCode);
    await transactions.create({
      id: txn.id,
      accountId: txn.accountId,
      amountMinor: txn.kind === "Expense" ? -magnitude : magnitude,
      occurredAt: txn.occurredAt,
      description: txn.description,
      trustStatus: "Confirmed",
      transferId: null,
      category: txn.category as TransactionCategory,
      importBatchId: null
    });
  }

  for (const fd of data.fixedDeposits) {
    const principalMinor = parseDecimalToMinorUnits(fd.principal, fd.currencyCode);
    const interestRateBps = parsePercentageToBps(fd.interestRate);
    await fixedDeposits.create(
      {
        id: fd.id,
        name: fd.name,
        accountNumber: fd.accountNumber,
        institutionId: fd.institutionId,
        linkedAccountId: fd.linkedAccountId,
        principalMinor,
        originalPrincipalMinor: principalMinor,
        currencyCode: fd.currencyCode,
        interestRateBps,
        openedDate: fd.openedDate,
        maturityDate: fd.maturityDate,
        status: "Open"
      },
      fd.debitNow
        ? {
            transferId: fd.openingTransferId,
            transactionId: fd.openingTransactionId,
            description: "Opening deposit"
          }
        : undefined
    );
  }

  for (const xfer of data.transfers) {
    await transfers.create({
      id: xfer.id,
      sourceAccountId: xfer.sourceAccountId,
      sourceFixedDepositId: null,
      sourceAmountMinor: parseDecimalToMinorUnits(xfer.sourceAmount, xfer.sourceCurrencyCode),
      sourceCurrencyCode: xfer.sourceCurrencyCode,
      destinationAccountId: xfer.destinationAccountId,
      destinationFixedDepositId: null,
      destinationAmountMinor: parseDecimalToMinorUnits(
        xfer.destinationAmount,
        xfer.destinationCurrencyCode
      ),
      destinationCurrencyCode: xfer.destinationCurrencyCode,
      occurredAt: xfer.occurredAt,
      description: xfer.description,
      purpose: xfer.purpose
    });
  }

  return {
    institutions: data.institutions.length,
    accounts: data.accounts.length,
    fixedDeposits: data.fixedDeposits.length,
    transactions: data.transactions.length,
    transfers: data.transfers.length
  };
}
