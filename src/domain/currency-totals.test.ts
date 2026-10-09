import { describe, expect, it } from "vitest";

import { computeCurrencyTotals } from "@/domain/currency-totals";

describe("computeCurrencyTotals", () => {
  it("returns nothing for no entries", () => {
    expect(computeCurrencyTotals([])).toEqual([]);
  });

  it("sums account and fixed deposit minor units per currency, counting each kind", () => {
    const totals = computeCurrencyTotals([
      { currencyCode: "INR", amountMinor: 482_310_55, kind: "account" },
      { currencyCode: "INR", amountMinor: 1_864_200_00, kind: "account" },
      { currencyCode: "INR", amountMinor: 10_00_000_00, kind: "fixedDeposit" }
    ]);

    expect(totals).toEqual([
      { currencyCode: "INR", totalMinor: 3_346_510_55, accountCount: 2, fixedDepositCount: 1 }
    ]);
  });

  it("never sums across currencies, keeping each currency in its own group", () => {
    const totals = computeCurrencyTotals([
      { currencyCode: "INR", amountMinor: 100_00, kind: "account" },
      { currencyCode: "AED", amountMinor: 200_00, kind: "account" },
      { currencyCode: "USD", amountMinor: 300_00, kind: "account" }
    ]);

    expect(totals.map((total) => total.currencyCode).sort()).toEqual(["AED", "INR", "USD"]);
    expect(totals.find((total) => total.currencyCode === "USD")).toEqual({
      currencyCode: "USD",
      totalMinor: 300_00,
      accountCount: 1,
      fixedDepositCount: 0
    });
  });

  it("keeps a negative (overdrawn) balance's sign in the currency total", () => {
    const totals = computeCurrencyTotals([
      { currencyCode: "INR", amountMinor: -500_00, kind: "account" }
    ]);

    expect(totals).toEqual([
      { currencyCode: "INR", totalMinor: -500_00, accountCount: 1, fixedDepositCount: 0 }
    ]);
  });

  it("rejects a non-integer minor-unit amount", () => {
    expect(() =>
      computeCurrencyTotals([{ currencyCode: "INR", amountMinor: 100.5, kind: "account" }])
    ).toThrow("Minor units must be safe integers.");
  });
});
