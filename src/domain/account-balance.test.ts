import { describe, expect, it } from "vitest";

import { computeAccountBalance, computeAccountBalanceAsOf } from "@/domain/account-balance";
import type { Transaction } from "@/domain/transaction";

describe("computeAccountBalance", () => {
  it("sums signed transaction minor units exactly without mutating input", () => {
    const transactions: Transaction[] = [
      {
        id: "txn-1",
        accountId: "acc-1",
        amountMinor: 150_000,
        occurredAt: "2026-01-01T10:00:00.000Z",
        description: "Salary",
        trustStatus: "Confirmed",
        transferId: null,
        category: null,
        importBatchId: null
      },
      {
        id: "txn-2",
        accountId: "acc-1",
        amountMinor: -25_500,
        occurredAt: "2026-01-02T10:00:00.000Z",
        description: "Rent",
        trustStatus: "Confirmed",
        transferId: null,
        category: null,
        importBatchId: null
      },
      {
        id: "txn-3",
        accountId: "acc-1",
        amountMinor: -1_999,
        occurredAt: "2026-01-03T10:00:00.000Z",
        description: "Fee",
        trustStatus: "Imported",
        transferId: null,
        category: null,
        importBatchId: null
      }
    ];
    const copy = structuredClone(transactions);

    const balanceMinor = computeAccountBalance(transactions);

    expect(balanceMinor).toBe(122_501);
    expect(transactions).toEqual(copy);
  });

  it("rejects fractional minor units", () => {
    const transactions: Transaction[] = [
      {
        id: "txn-1",
        accountId: "acc-1",
        amountMinor: 1.5,
        occurredAt: "2026-01-01T10:00:00.000Z",
        description: "Invalid fraction",
        trustStatus: "Confirmed",
        transferId: null,
        category: null,
        importBatchId: null
      }
    ];

    expect(() => computeAccountBalance(transactions)).toThrow("Minor units must be safe integers.");
  });

  it("rejects balances outside JavaScript's safe integer range", () => {
    const transactions: Transaction[] = [
      {
        id: "txn-1",
        accountId: "acc-1",
        amountMinor: Number.MAX_SAFE_INTEGER,
        occurredAt: "2026-01-01T10:00:00.000Z",
        description: "Large deposit",
        trustStatus: "Confirmed",
        transferId: null,
        category: null,
        importBatchId: null
      },
      {
        id: "txn-2",
        accountId: "acc-1",
        amountMinor: 1,
        occurredAt: "2026-01-02T10:00:00.000Z",
        description: "Overflow",
        trustStatus: "Confirmed",
        transferId: null,
        category: null,
        importBatchId: null
      }
    ];

    expect(() => computeAccountBalance(transactions)).toThrow("Minor units must be safe integers.");
  });
});

describe("computeAccountBalanceAsOf", () => {
  it("includes transactions through end of asOfDate (UTC) and excludes later ones", () => {
    const transactions: Transaction[] = [
      {
        id: "txn-1",
        accountId: "acc-1",
        amountMinor: 10_000,
        occurredAt: "2026-01-02T23:59:59.999Z",
        description: "On boundary",
        trustStatus: "Confirmed",
        transferId: null,
        category: null,
        importBatchId: null
      },
      {
        id: "txn-2",
        accountId: "acc-1",
        amountMinor: 5_000,
        occurredAt: "2026-01-03T00:00:00.000Z",
        description: "Just after boundary",
        trustStatus: "Confirmed",
        transferId: null,
        category: null,
        importBatchId: null
      }
    ];

    const balanceMinor = computeAccountBalanceAsOf(transactions, "2026-01-02");

    expect(balanceMinor).toBe(10_000);
  });

  it("returns 0 for no transactions", () => {
    expect(computeAccountBalanceAsOf([], "2026-01-02")).toBe(0);
  });
});
