import { describe, expect, it } from "vitest";

import { generateDemoSeedData } from "@/demo-data/generate-seed-data";

describe("generateDemoSeedData", () => {
  it("builds 10 banks with the requested account mix and ledger volume", () => {
    const data = generateDemoSeedData({ generatedAt: "2026-09-05T00:00:00.000Z" });

    expect(data.institutions).toHaveLength(10);
    expect(data.accounts).toHaveLength(100);
    expect(data.fixedDeposits).toHaveLength(100);
    expect(data.transactions).toHaveLength(600);
    expect(data.transfers).toHaveLength(600);

    for (const institution of data.institutions) {
      const accounts = data.accounts.filter((a) => a.institutionId === institution.id);
      expect(accounts).toHaveLength(10);
      expect(accounts.filter((a) => a.currencyCode === "INR")).toHaveLength(5);
      expect(accounts.filter((a) => a.currencyCode === "USD")).toHaveLength(3);
      expect(accounts.filter((a) => a.currencyCode === "AED")).toHaveLength(2);
    }

    for (const account of data.accounts) {
      expect(data.fixedDeposits.filter((fd) => fd.linkedAccountId === account.id)).toHaveLength(1);
      expect(data.transactions.filter((txn) => txn.accountId === account.id)).toHaveLength(6);
      expect(data.transfers.filter((xfer) => xfer.sourceAccountId === account.id)).toHaveLength(6);
      const kinds = data.transactions
        .filter((txn) => txn.accountId === account.id)
        .map((txn) => txn.kind);
      expect(kinds.filter((k) => k === "Income")).toHaveLength(3);
      expect(kinds.filter((k) => k === "Expense")).toHaveLength(3);
    }
  });
});
