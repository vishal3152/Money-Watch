import { assertMinorUnits } from "@/domain/money";

export type CurrencyTotalEntry = {
  currencyCode: string;
  amountMinor: number;
  kind: "account" | "fixedDeposit";
};

export type CurrencyTotal = {
  currencyCode: string;
  totalMinor: number;
  accountCount: number;
  fixedDepositCount: number;
};

/** Per-currency totals only — currencies are never summed against each other (no FX-rate service
 * exists, see docs/adr/0001). Safe to run entirely client-side since it's pure arithmetic over
 * data the server already sent down. */
export function computeCurrencyTotals(entries: readonly CurrencyTotalEntry[]): CurrencyTotal[] {
  const totalsByCurrency = new Map<string, CurrencyTotal>();

  for (const entry of entries) {
    assertMinorUnits(entry.amountMinor);
    const existing = totalsByCurrency.get(entry.currencyCode) ?? {
      currencyCode: entry.currencyCode,
      totalMinor: 0,
      accountCount: 0,
      fixedDepositCount: 0
    };

    const nextTotalMinor = existing.totalMinor + entry.amountMinor;
    assertMinorUnits(nextTotalMinor);

    totalsByCurrency.set(entry.currencyCode, {
      currencyCode: entry.currencyCode,
      totalMinor: nextTotalMinor,
      accountCount: existing.accountCount + (entry.kind === "account" ? 1 : 0),
      fixedDepositCount: existing.fixedDepositCount + (entry.kind === "fixedDeposit" ? 1 : 0)
    });
  }

  return Array.from(totalsByCurrency.values());
}
