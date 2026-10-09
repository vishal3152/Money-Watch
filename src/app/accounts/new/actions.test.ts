import { randomUUID } from "node:crypto";

import postgres from "postgres";
import { describe, expect, it, vi } from "vitest";

import { TEXT_FIELD_MAX_LENGTH } from "@/app/form-limits";

import { createAccount, type AccountFormState } from "@/app/accounts/new/actions";
import { PgAccountRepository } from "@/db/postgres/repositories/account-repository";
import { PgInstitutionRepository } from "@/db/postgres/repositories/institution-repository";
import { AccountRepository } from "@/db/repositories/account-repository";
import { InstitutionRepository } from "@/db/repositories/institution-repository";
import { createTestDb } from "@/db/repositories/test-db";

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

function accountFormData(
  overrides: Partial<Record<"institutionId" | "name" | "accountNumber" | "currencyCode", string>> = {}
) {
  const formData = new FormData();
  formData.set("institutionId", overrides.institutionId ?? "inst-1");
  formData.set("name", overrides.name ?? "Everyday account");
  if (overrides.accountNumber !== undefined) {
    formData.set("accountNumber", overrides.accountNumber);
  }
  formData.set("currencyCode", overrides.currencyCode ?? "INR");
  return formData;
}

describe("createAccount", () => {
  it("rejects a malformed currency code before any repository call", async () => {
    const testDb = createTestDb();
    const accounts = new AccountRepository(testDb.db);
    const redirectTo = vi.fn();

    const result = await createAccount(
      {} as AccountFormState,
      accountFormData({ currencyCode: "inr" }),
      { db: testDb.db, redirectTo, newId: () => "acc-should-not-exist" }
    );

    expect(result).toMatchObject({
      fieldErrors: { currencyCode: { key: "errors.currencyCodeInvalid" } },
      values: { currencyCode: "inr", name: "Everyday account", institutionId: "inst-1" }
    });
    expect(result.formKey).toBeTruthy();
    expect(await accounts.listAll()).toEqual([]);
    expect(redirectTo).not.toHaveBeenCalled();
  });

  it("surfaces an unknown Institution as a banner error without persisting", async () => {
    const testDb = createTestDb();
    const accounts = new AccountRepository(testDb.db);
    const redirectTo = vi.fn();

    const result = await createAccount(
      {} as AccountFormState,
      accountFormData({ institutionId: "missing" }),
      { db: testDb.db, redirectTo, newId: () => "acc-should-not-exist" }
    );

    expect(result).toMatchObject({
      formError: { key: "errors.institutionMissing" }
    });
    expect(result.values).toBeDefined();
    expect(result.formKey).toBeTruthy();
    expect(await accounts.listAll()).toEqual([]);
    expect(redirectTo).not.toHaveBeenCalled();
  });

  it("persists a valid Account retrievable directly and through its Institution list", async () => {
    const testDb = createTestDb();
    const institutions = new InstitutionRepository(testDb.db);
    const accounts = new AccountRepository(testDb.db);
    const redirectTo = vi.fn();
    await institutions.create({ id: "inst-1", name: "Institution One" });

    const result = await createAccount({} as AccountFormState, accountFormData(), {
      db: testDb.db,
      redirectTo,
      newId: () => "acc-1"
    });

    const account = {
      id: "acc-1",
      institutionId: "inst-1",
      name: "Everyday account",
      accountNumber: null,
      currencyCode: "INR"
    };
    expect(result).toEqual({});
    expect(await accounts.getById("acc-1")).toEqual(account);
    expect((await accounts.listAll()).filter((item) => item.institutionId === "inst-1")).toEqual([
      account
    ]);
    expect(redirectTo).toHaveBeenCalledWith("/accounts/acc-1?message=bank_account_created");
  });

  it("persists an optional account number and rejects an oversized one", async () => {
    const testDb = createTestDb();
    const accounts = new AccountRepository(testDb.db);
    await new InstitutionRepository(testDb.db).create({ id: "inst-1", name: "Institution One" });

    const oversized = await createAccount(
      {} as AccountFormState,
      accountFormData({ accountNumber: "x".repeat(61) }),
      { db: testDb.db, redirectTo: vi.fn(), newId: () => "acc-long" }
    );
    expect(oversized.fieldErrors?.accountNumber).toEqual({
      key: "errors.textTooLong",
      params: { max: TEXT_FIELD_MAX_LENGTH }
    });
    expect(await accounts.listAll()).toEqual([]);

    const redirectTo = vi.fn();
    const result = await createAccount(
      {} as AccountFormState,
      accountFormData({ accountNumber: "  1234567890  " }),
      { db: testDb.db, redirectTo, newId: () => "acc-numbered" }
    );
    expect(result).toEqual({});
    expect(await accounts.getById("acc-numbered")).toMatchObject({
      accountNumber: "1234567890"
    });
  });

  it("persists to the Postgres repository, scoped to the owner, when an owner is resolved", async () => {
    const ownerId = randomUUID();
    const institution = { id: randomUUID(), name: "Cloud Bank" };
    await new PgInstitutionRepository(TEST_DATABASE_URL, ownerId).create(institution);
    const id = randomUUID();
    const redirectTo = vi.fn();

    try {
      const result = await createAccount(
        {} as AccountFormState,
        accountFormData({ institutionId: institution.id }),
        {
          getCurrentOwnerId: async () => ownerId,
          isCloudMode: () => true,
          postgresConnectionString: TEST_DATABASE_URL,
          redirectTo,
          newId: () => id
        }
      );

      expect(result).toEqual({});
      const pgAccounts = new PgAccountRepository(TEST_DATABASE_URL, ownerId);
      expect(await pgAccounts.getById(id)).toEqual({
        id,
        institutionId: institution.id,
        name: "Everyday account",
        accountNumber: null,
        currencyCode: "INR"
      });
      expect(redirectTo).toHaveBeenCalledWith(`/accounts/${id}?message=bank_account_created`);
    } finally {
      const admin = postgres(TEST_DATABASE_URL, { max: 1 });
      await admin`delete from accounts where id = ${id}`;
      await admin`delete from institutions where id = ${institution.id}`;
      await admin.end();
    }
  });
});
