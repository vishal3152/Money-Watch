import type { Transaction } from "@/domain/transaction";
import { assertMinorUnits } from "@/domain/money";

export function computeAccountBalance(transactions: readonly Transaction[]) {
  return transactions.reduce((sum, transaction) => {
    assertMinorUnits(transaction.amountMinor);
    const nextBalance = sum + transaction.amountMinor;
    assertMinorUnits(nextBalance);
    return nextBalance;
  }, 0);
}

export function computeAccountBalanceAsOf(transactions: readonly Transaction[], asOfDate: string) {
  const cutoff = new Date(`${asOfDate}T23:59:59.999Z`).getTime();

  return computeAccountBalance(transactions.filter((transaction) => Date.parse(transaction.occurredAt) <= cutoff));
}
