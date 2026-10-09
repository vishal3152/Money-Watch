import { randomUUID } from "node:crypto";

import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";

import { PgInstitutionRepository } from "@/db/postgres/repositories/institution-repository";
import { PgShareTradingAccountRepository } from "@/db/postgres/repositories/share-trading-account-repository";

const CONNECTION_STRING =
  process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

const admin = postgres(CONNECTION_STRING, { max: 1 });

afterAll(async () => {
  await admin.end();
});

describe("PgShareTradingAccountRepository", () => {
  it("listAll() only returns ShareTradingAccounts belonging to the scoped Owner", async () => {
    const ownerA = randomUUID();
    const ownerB = randomUUID();
    const institutionA = { id: randomUUID(), name: "Owner A Broker" };
    const institutionB = { id: randomUUID(), name: "Owner B Broker" };
    const shareTradingAccountA = {
      id: randomUUID(),
      institutionId: institutionA.id,
      name: "Owner A Equities",
      accountNumber: null,
      currencyCode: "USD"
    };
    const shareTradingAccountB = {
      id: randomUUID(),
      institutionId: institutionB.id,
      name: "Owner B Equities",
      accountNumber: null,
      currencyCode: "USD"
    };

    try {
      await new PgInstitutionRepository(CONNECTION_STRING, ownerA).create(institutionA);
      await new PgInstitutionRepository(CONNECTION_STRING, ownerB).create(institutionB);

      const repoA = new PgShareTradingAccountRepository(CONNECTION_STRING, ownerA);
      const repoB = new PgShareTradingAccountRepository(CONNECTION_STRING, ownerB);
      await repoA.create(shareTradingAccountA);
      await repoB.create(shareTradingAccountB);

      expect(await repoA.listAll()).toEqual([shareTradingAccountA]);
      expect(await repoA.getById(shareTradingAccountB.id)).toBeNull();
    } finally {
      await admin`delete from share_trading_accounts where id in (${shareTradingAccountA.id}, ${shareTradingAccountB.id})`;
      await admin`delete from institutions where id in (${institutionA.id}, ${institutionB.id})`;
    }
  });

  it("listByInstitutionId() does not leak another Owner's ShareTradingAccounts for an Institution id it does not own", async () => {
    const ownerA = randomUUID();
    const ownerB = randomUUID();
    const institutionB = { id: randomUUID(), name: "Owner B Broker" };
    const shareTradingAccountB = {
      id: randomUUID(),
      institutionId: institutionB.id,
      name: "Owner B Equities",
      accountNumber: null,
      currencyCode: "USD"
    };

    try {
      await new PgInstitutionRepository(CONNECTION_STRING, ownerB).create(institutionB);
      await new PgShareTradingAccountRepository(CONNECTION_STRING, ownerB).create(shareTradingAccountB);

      const repoA = new PgShareTradingAccountRepository(CONNECTION_STRING, ownerA);

      expect(await repoA.listByInstitutionId(institutionB.id)).toEqual([]);
    } finally {
      await admin`delete from share_trading_accounts where id = ${shareTradingAccountB.id}`;
      await admin`delete from institutions where id = ${institutionB.id}`;
    }
  });

  it("rejects a ShareTradingAccount referencing another Owner's Institution, even though the id exists", async () => {
    const ownerA = randomUUID();
    const ownerB = randomUUID();
    const institutionB = { id: randomUUID(), name: "Owner B Broker" };

    try {
      await new PgInstitutionRepository(CONNECTION_STRING, ownerB).create(institutionB);

      const repoA = new PgShareTradingAccountRepository(CONNECTION_STRING, ownerA);

      await expect(
        repoA.create({
          id: randomUUID(),
          institutionId: institutionB.id,
          name: "Cross-owner Equities",
          accountNumber: null,
          currencyCode: "USD"
        })
      ).rejects.toThrow();
    } finally {
      await admin`delete from institutions where id = ${institutionB.id}`;
    }
  });
});
