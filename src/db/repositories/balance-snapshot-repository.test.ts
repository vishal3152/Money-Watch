import { describe, expect, it } from "vitest";

import type { DrizzleDb } from "@/db/client";
import { AccountRepository } from "@/db/repositories/account-repository";
import { BalanceSnapshotRepository } from "@/db/repositories/balance-snapshot-repository";
import { InstitutionRepository } from "@/db/repositories/institution-repository";
import { createTestDb } from "@/db/repositories/test-db";
import { InvalidMinorUnitsError } from "@/domain/money";

describe("BalanceSnapshotRepository", () => {
  async function seedAccount(db: DrizzleDb) {
    const institutionRepository = new InstitutionRepository(db);
    const accountRepository = new AccountRepository(db);

    await institutionRepository.create({ id: "inst-1", name: "Bank One" });
    await accountRepository.create({
      id: "acc-1",
      institutionId: "inst-1",
      name: "Primary Checking",
      accountNumber: null,
      currencyCode: "INR"
    });
  }

  it("creates and reads a balance snapshot", async () => {
    const testDb = createTestDb();
    await seedAccount(testDb.db);

    const repository = new BalanceSnapshotRepository(testDb.db);

    await repository.create({
      id: "snap-1",
      accountId: "acc-1",
      asOfDate: "2026-01-31",
      balanceMinor: 150_000
    });

    const snapshot = await repository.getById("snap-1");

    expect(snapshot).toEqual({
      id: "snap-1",
      accountId: "acc-1",
      asOfDate: "2026-01-31",
      balanceMinor: 150_000
    });
  });

  it("returns null for an unknown snapshot id", async () => {
    const testDb = createTestDb();

    const repository = new BalanceSnapshotRepository(testDb.db);

    const snapshot = await repository.getById("missing");

    expect(snapshot).toBeNull();
  });

  it("lists an account's snapshots ordered by date", async () => {
    const testDb = createTestDb();
    await seedAccount(testDb.db);

    const repository = new BalanceSnapshotRepository(testDb.db);

    await repository.create({
      id: "snap-2",
      accountId: "acc-1",
      asOfDate: "2026-02-28",
      balanceMinor: 160_000
    });
    await repository.create({
      id: "snap-1",
      accountId: "acc-1",
      asOfDate: "2026-01-31",
      balanceMinor: 150_000
    });

    const snapshots = await repository.listByAccountId("acc-1");

    expect(snapshots).toEqual([
      {
        id: "snap-1",
        accountId: "acc-1",
        asOfDate: "2026-01-31",
        balanceMinor: 150_000
      },
      {
        id: "snap-2",
        accountId: "acc-1",
        asOfDate: "2026-02-28",
        balanceMinor: 160_000
      }
    ]);
  });

  it("rejects fractional minor units", async () => {
    const testDb = createTestDb();
    await seedAccount(testDb.db);

    const repository = new BalanceSnapshotRepository(testDb.db);

    await expect(
      repository.create({
        id: "snap-1",
        accountId: "acc-1",
        asOfDate: "2026-01-31",
        balanceMinor: 1.5
      })
    ).rejects.toBeInstanceOf(InvalidMinorUnitsError);
  });
});
