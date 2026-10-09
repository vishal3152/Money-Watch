import { randomUUID } from "node:crypto";

import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";

import { PgAccountRepository } from "@/db/postgres/repositories/account-repository";
import { PgInstitutionRepository } from "@/db/postgres/repositories/institution-repository";
import { PgShareTradingAccountRepository } from "@/db/postgres/repositories/share-trading-account-repository";
import { EntityHasDependentsError, InstitutionNotFoundError } from "@/db/errors";

const CONNECTION_STRING =
  process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

const admin = postgres(CONNECTION_STRING, { max: 1 });

afterAll(async () => {
  await admin.end();
});

describe("PgInstitutionRepository", () => {
  it("listAll() only returns Institutions belonging to the scoped Owner", async () => {
    const ownerA = randomUUID();
    const ownerB = randomUUID();
    const institutionA = { id: randomUUID(), name: "Owner A Bank" };
    const institutionB = { id: randomUUID(), name: "Owner B Bank" };

    try {
      const repoA = new PgInstitutionRepository(CONNECTION_STRING, ownerA);
      const repoB = new PgInstitutionRepository(CONNECTION_STRING, ownerB);

      await repoA.create(institutionA);
      await repoB.create(institutionB);

      const ownerAInstitutions = await repoA.listAll();

      expect(ownerAInstitutions).toEqual([institutionA]);
    } finally {
      await admin`delete from institutions where id in (${institutionA.id}, ${institutionB.id})`;
    }
  });

  it("getById() returns null for an Institution belonging to another Owner", async () => {
    const ownerA = randomUUID();
    const ownerB = randomUUID();
    const institution = { id: randomUUID(), name: "Owner B Bank" };

    try {
      await new PgInstitutionRepository(CONNECTION_STRING, ownerB).create(institution);

      const repoA = new PgInstitutionRepository(CONNECTION_STRING, ownerA);
      expect(await repoA.getById(institution.id)).toBeNull();

      const repoB = new PgInstitutionRepository(CONNECTION_STRING, ownerB);
      expect(await repoB.getById(institution.id)).toEqual(institution);
    } finally {
      await admin`delete from institutions where id = ${institution.id}`;
    }
  });

  it("updates an Institution's name", async () => {
    const ownerId = randomUUID();
    const institution = { id: randomUUID(), name: "Bank One" };

    try {
      const repo = new PgInstitutionRepository(CONNECTION_STRING, ownerId);
      await repo.create(institution);

      const updated = await repo.update(institution.id, { name: "Renamed Bank" });

      expect(updated).toEqual({ id: institution.id, name: "Renamed Bank" });
      expect(await repo.getById(institution.id)).toEqual({ id: institution.id, name: "Renamed Bank" });
    } finally {
      await admin`delete from institutions where id = ${institution.id}`;
    }
  });

  it("rejects updating an Institution belonging to another Owner", async () => {
    const ownerA = randomUUID();
    const ownerB = randomUUID();
    const institution = { id: randomUUID(), name: "Owner B Bank" };

    try {
      await new PgInstitutionRepository(CONNECTION_STRING, ownerB).create(institution);

      const repoA = new PgInstitutionRepository(CONNECTION_STRING, ownerA);

      await expect(repoA.update(institution.id, { name: "Hijacked" })).rejects.toBeInstanceOf(
        InstitutionNotFoundError
      );
    } finally {
      await admin`delete from institutions where id = ${institution.id}`;
    }
  });

  it("deletes an Institution with no dependent Accounts", async () => {
    const ownerId = randomUUID();
    const institution = { id: randomUUID(), name: "Bank One" };

    try {
      const repo = new PgInstitutionRepository(CONNECTION_STRING, ownerId);
      await repo.create(institution);

      await repo.delete(institution.id);

      expect(await repo.listAll()).toEqual([]);
    } finally {
      await admin`delete from institutions where id = ${institution.id}`;
    }
  });

  it("rejects deleting an Institution that still has an Account", async () => {
    const ownerId = randomUUID();
    const institution = { id: randomUUID(), name: "Bank One" };
    const account = {
      id: randomUUID(),
      institutionId: institution.id,
      name: "Savings",
      accountNumber: null,
      currencyCode: "INR"
    };

    try {
      const repo = new PgInstitutionRepository(CONNECTION_STRING, ownerId);
      await repo.create(institution);
      await new PgAccountRepository(CONNECTION_STRING, ownerId).create(account);

      await expect(repo.delete(institution.id)).rejects.toBeInstanceOf(EntityHasDependentsError);
      expect(await repo.listAll()).toEqual([institution]);
    } finally {
      await admin`delete from accounts where id = ${account.id}`;
      await admin`delete from institutions where id = ${institution.id}`;
    }
  });

  it("rejects deleting an Institution that still has a ShareTradingAccount", async () => {
    const ownerId = randomUUID();
    const institution = { id: randomUUID(), name: "Broker One" };
    const shareTradingAccount = {
      id: randomUUID(),
      institutionId: institution.id,
      name: "US Equities",
      accountNumber: null,
      currencyCode: "USD"
    };

    try {
      const repo = new PgInstitutionRepository(CONNECTION_STRING, ownerId);
      await repo.create(institution);
      await new PgShareTradingAccountRepository(CONNECTION_STRING, ownerId).create(shareTradingAccount);

      await expect(repo.delete(institution.id)).rejects.toBeInstanceOf(EntityHasDependentsError);
      expect(await repo.listAll()).toEqual([institution]);
    } finally {
      await admin`delete from share_trading_accounts where id = ${shareTradingAccount.id}`;
      await admin`delete from institutions where id = ${institution.id}`;
    }
  });
});
