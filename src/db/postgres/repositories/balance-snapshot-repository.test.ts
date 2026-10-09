import { randomUUID } from "node:crypto";

import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";

import { PgAccountRepository } from "@/db/postgres/repositories/account-repository";
import { PgBalanceSnapshotRepository } from "@/db/postgres/repositories/balance-snapshot-repository";
import { PgInstitutionRepository } from "@/db/postgres/repositories/institution-repository";
import { InvalidMinorUnitsError } from "@/domain/money";

const CONNECTION_STRING =
  process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

const admin = postgres(CONNECTION_STRING, { max: 1 });

afterAll(async () => {
  await admin.end();
});

async function seedOwnerWithAccount(ownerId: string) {
  const institution = { id: randomUUID(), name: "Bank" };
  const account = {
    id: randomUUID(),
    institutionId: institution.id,
    name: "Checking",
    accountNumber: null,
    currencyCode: "USD"
  };

  await new PgInstitutionRepository(CONNECTION_STRING, ownerId).create(institution);
  await new PgAccountRepository(CONNECTION_STRING, ownerId).create(account);

  return { institution, account };
}

describe("PgBalanceSnapshotRepository", () => {
  it("stores and lists only BalanceSnapshots belonging to the scoped Owner's Account", async () => {
    const ownerA = randomUUID();
    const ownerB = randomUUID();
    const { institution: institutionA, account: accountA } = await seedOwnerWithAccount(ownerA);
    const { institution: institutionB, account: accountB } = await seedOwnerWithAccount(ownerB);
    const snapshotA1 = {
      id: randomUUID(),
      accountId: accountA.id,
      asOfDate: "2026-01-31",
      balanceMinor: 150_000
    };
    const snapshotA2 = {
      id: randomUUID(),
      accountId: accountA.id,
      asOfDate: "2026-02-28",
      balanceMinor: 175_000
    };
    const snapshotB = {
      id: randomUUID(),
      accountId: accountB.id,
      asOfDate: "2026-01-31",
      balanceMinor: 999_999
    };

    try {
      const repoA = new PgBalanceSnapshotRepository(CONNECTION_STRING, ownerA);
      const repoB = new PgBalanceSnapshotRepository(CONNECTION_STRING, ownerB);
      await repoA.create(snapshotA2);
      await repoA.create(snapshotA1);
      await repoB.create(snapshotB);

      expect(await repoA.getById(snapshotA1.id)).toEqual(snapshotA1);
      expect(await repoA.getById(snapshotB.id)).toBeNull();
      expect(await repoA.listByAccountId(accountA.id)).toEqual([snapshotA1, snapshotA2]);
    } finally {
      await admin`delete from balance_snapshots where id in (${snapshotA1.id}, ${snapshotA2.id}, ${snapshotB.id})`;
      await admin`delete from accounts where id in (${accountA.id}, ${accountB.id})`;
      await admin`delete from institutions where id in (${institutionA.id}, ${institutionB.id})`;
    }
  });

  it("rejects a BalanceSnapshot referencing another Owner's Account, even though the id exists", async () => {
    const ownerA = randomUUID();
    const ownerB = randomUUID();
    const { institution: institutionB, account: accountB } = await seedOwnerWithAccount(ownerB);

    try {
      const repoA = new PgBalanceSnapshotRepository(CONNECTION_STRING, ownerA);

      await expect(
        repoA.create({
          id: randomUUID(),
          accountId: accountB.id,
          asOfDate: "2026-01-31",
          balanceMinor: 150_000
        })
      ).rejects.toThrow();
    } finally {
      await admin`delete from accounts where id = ${accountB.id}`;
      await admin`delete from institutions where id = ${institutionB.id}`;
    }
  });

  it("rejects fractional minor units", async () => {
    const ownerId = randomUUID();
    const { institution, account } = await seedOwnerWithAccount(ownerId);

    try {
      await expect(
        new PgBalanceSnapshotRepository(CONNECTION_STRING, ownerId).create({
          id: randomUUID(),
          accountId: account.id,
          asOfDate: "2026-01-31",
          balanceMinor: 1.5
        })
      ).rejects.toBeInstanceOf(InvalidMinorUnitsError);
    } finally {
      await admin`delete from accounts where id = ${account.id}`;
      await admin`delete from institutions where id = ${institution.id}`;
    }
  });
});
