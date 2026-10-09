import { describe, expect, it } from "vitest";

import { generateDemoSeedData } from "@/demo-data/generate-seed-data";
import { loadDemoSeedData } from "@/demo-data/load-demo-seed";
import { AccountRepository } from "@/db/repositories/account-repository";
import { FixedDepositRepository } from "@/db/repositories/fixed-deposit-repository";
import { InstitutionRepository } from "@/db/repositories/institution-repository";
import { TransactionRepository } from "@/db/repositories/transaction-repository";
import { TransferRepository } from "@/db/repositories/transfer-repository";
import { createTestDb } from "@/db/repositories/test-db";

describe("loadDemoSeedData", () => {
  it("persists a miniature slice of the demo shape", async () => {
    const full = generateDemoSeedData({ generatedAt: "2026-09-05T00:00:00.000Z" });
    const institution = full.institutions[0]!;
    const accounts = full.accounts.filter((a) => a.institutionId === institution.id).slice(0, 2);
    const accountIds = new Set(accounts.map((a) => a.id));
    const data = {
      ...full,
      institutions: [institution],
      accounts,
      transactions: full.transactions.filter((t) => accountIds.has(t.accountId)),
      fixedDeposits: full.fixedDeposits.filter((fd) => accountIds.has(fd.linkedAccountId)),
      transfers: full.transfers.filter(
        (xfer) =>
          accountIds.has(xfer.sourceAccountId) && accountIds.has(xfer.destinationAccountId)
      )
    };

    const testDb = createTestDb();
    const result = await loadDemoSeedData(testDb.db, data);

    expect(result.institutions).toBe(1);
    expect(result.accounts).toBe(2);
    expect(await new InstitutionRepository(testDb.db).listAll()).toHaveLength(1);
    expect(await new AccountRepository(testDb.db).listAll()).toHaveLength(2);
    expect(await new FixedDepositRepository(testDb.db).listAll()).toHaveLength(2);

    for (const account of accounts) {
      const txns = await new TransactionRepository(testDb.db).listByAccountId(account.id);
      // 6 seeded + 1 FD opening debit
      expect(txns.length).toBeGreaterThanOrEqual(7);
      const xfers = await new TransferRepository(testDb.db).listByLeg(account.id);
      expect(xfers.length).toBeGreaterThanOrEqual(1);
    }
  });

  it("refuses to load when a seed Institution id already exists", async () => {
    const data = generateDemoSeedData({ generatedAt: "2026-09-05T00:00:00.000Z" });
    const tiny = {
      ...data,
      institutions: [data.institutions[0]!],
      accounts: [],
      fixedDeposits: [],
      transactions: [],
      transfers: []
    };
    const testDb = createTestDb();
    await new InstitutionRepository(testDb.db).create(tiny.institutions[0]!);

    await expect(loadDemoSeedData(testDb.db, tiny)).rejects.toThrow(/already exists/);
  });

  it("persists the full generated demo dataset", async () => {
    const data = generateDemoSeedData({ generatedAt: "2026-09-05T00:00:00.000Z" });
    const testDb = createTestDb();

    const result = await loadDemoSeedData(testDb.db, data);

    expect(result).toEqual({
      institutions: 10,
      accounts: 100,
      fixedDeposits: 100,
      transactions: 600,
      transfers: 600
    });
    expect(await new InstitutionRepository(testDb.db).listAll()).toHaveLength(10);
    expect(await new AccountRepository(testDb.db).listAll()).toHaveLength(100);
    expect(await new FixedDepositRepository(testDb.db).listAll()).toHaveLength(100);
  }, 60_000);
});
