import { describe, expect, it } from "vitest";

import { DatabaseConstraintError, EntityHasDependentsError, InstitutionNotFoundError } from "@/db/errors";
import { AccountRepository } from "@/db/repositories/account-repository";
import { FixedDepositRepository } from "@/db/repositories/fixed-deposit-repository";
import { InstitutionRepository } from "@/db/repositories/institution-repository";
import { ShareTradingAccountRepository } from "@/db/repositories/share-trading-account-repository";
import { createTestDb } from "@/db/repositories/test-db";

describe("InstitutionRepository", () => {
  it("creates and reads an institution", async () => {
    const testDb = createTestDb();

    const repository = new InstitutionRepository(testDb.db);

    await repository.create({ id: "inst-1", name: "DBS Bank" });

    const institution = await repository.getById("inst-1");

    expect(institution).toEqual({ id: "inst-1", name: "DBS Bank" });
  });

  it("returns null for an unknown institution id", async () => {
    const testDb = createTestDb();

    const repository = new InstitutionRepository(testDb.db);

    const institution = await repository.getById("missing");

    expect(institution).toBeNull();
  });

  it("lists institutions ordered by id", async () => {
    const testDb = createTestDb();

    const repository = new InstitutionRepository(testDb.db);

    await repository.create({ id: "inst-2", name: "Bank Two" });
    await repository.create({ id: "inst-1", name: "Bank One" });

    const allInstitutions = await repository.listAll();

    expect(allInstitutions).toEqual([
      { id: "inst-1", name: "Bank One" },
      { id: "inst-2", name: "Bank Two" }
    ]);
  });

  it("updates an Institution's name", async () => {
    const testDb = createTestDb();
    const repository = new InstitutionRepository(testDb.db);
    await repository.create({ id: "inst-1", name: "Bank One" });

    const updated = await repository.update("inst-1", { name: "Renamed Bank" });

    expect(updated).toEqual({ id: "inst-1", name: "Renamed Bank" });
    expect(await repository.getById("inst-1")).toEqual({ id: "inst-1", name: "Renamed Bank" });
  });

  it("rejects updating an unknown Institution", async () => {
    const testDb = createTestDb();
    const repository = new InstitutionRepository(testDb.db);

    await expect(repository.update("missing", { name: "New Name" })).rejects.toBeInstanceOf(
      InstitutionNotFoundError
    );
  });

  it("returns a typed error when a database constraint rejects an institution", async () => {
    const testDb = createTestDb();

    const repository = new InstitutionRepository(testDb.db);

    await repository.create({ id: "inst-1", name: "Bank One" });

    await expect(repository.create({ id: "inst-1", name: "Duplicate" })).rejects.toBeInstanceOf(
      DatabaseConstraintError
    );
  });

  it("deletes an Institution with no Accounts or FixedDeposits", async () => {
    const testDb = createTestDb();
    const repository = new InstitutionRepository(testDb.db);
    await repository.create({ id: "inst-1", name: "Bank One" });

    await repository.delete("inst-1");

    expect(await repository.getById("inst-1")).toBeNull();
  });

  it("rejects deleting an Institution that still has an Account", async () => {
    const testDb = createTestDb();
    const repository = new InstitutionRepository(testDb.db);
    await repository.create({ id: "inst-1", name: "Bank One" });
    await new AccountRepository(testDb.db).create({
      id: "acc-1",
      institutionId: "inst-1",
      name: "Savings",
      accountNumber: null,
      currencyCode: "INR"
    });

    await expect(repository.delete("inst-1")).rejects.toBeInstanceOf(EntityHasDependentsError);
    expect(await repository.getById("inst-1")).not.toBeNull();
  });

  it("rejects deleting an Institution that still has a FixedDeposit", async () => {
    const testDb = createTestDb();
    const repository = new InstitutionRepository(testDb.db);
    await repository.create({ id: "inst-1", name: "Bank One" });
    await new AccountRepository(testDb.db).create({
      id: "acc-1",
      institutionId: "inst-1",
      name: "Savings",
      accountNumber: null,
      currencyCode: "INR"
    });
    await new FixedDepositRepository(testDb.db).create({
      id: "fd-1",
      name: "Term deposit",
      accountNumber: null,
      institutionId: "inst-1",
      linkedAccountId: "acc-1",
      principalMinor: 100_000,
      originalPrincipalMinor: 100_000,
      currencyCode: "INR",
      interestRateBps: 650,
      openedDate: "2026-01-01",
      maturityDate: "2027-01-01",
      status: "Open"
    });

    await expect(repository.delete("inst-1")).rejects.toBeInstanceOf(EntityHasDependentsError);
  });

  it("rejects deleting an Institution that still has a ShareTradingAccount", async () => {
    const testDb = createTestDb();
    const repository = new InstitutionRepository(testDb.db);
    await repository.create({ id: "inst-1", name: "Broker One" });
    await new ShareTradingAccountRepository(testDb.db).create({
      id: "sta-1",
      institutionId: "inst-1",
      name: "US Equities",
      accountNumber: null,
      currencyCode: "USD"
    });

    await expect(repository.delete("inst-1")).rejects.toBeInstanceOf(EntityHasDependentsError);
    expect(await repository.getById("inst-1")).not.toBeNull();
  });
});
