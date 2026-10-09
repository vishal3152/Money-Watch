import { randomUUID } from "node:crypto";

import postgres from "postgres";
import { describe, expect, it, vi } from "vitest";

import { updateAccount, type EditAccountFormState } from "@/app/accounts/[id]/edit/actions";
import { PgAccountRepository } from "@/db/postgres/repositories/account-repository";
import { PgInstitutionRepository } from "@/db/postgres/repositories/institution-repository";
import { AccountRepository } from "@/db/repositories/account-repository";
import { InstitutionRepository } from "@/db/repositories/institution-repository";
import { createTestDb } from "@/db/repositories/test-db";

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

function editFormData(
  accountId: string,
  overrides: Partial<Record<"name" | "accountNumber", string>> = {}
): FormData {
  const formData = new FormData();
  formData.set("accountId", accountId);
  formData.set("name", overrides.name ?? "Primary Checking");
  if (overrides.accountNumber !== undefined) {
    formData.set("accountNumber", overrides.accountNumber);
  }
  return formData;
}

describe("updateAccount", () => {
  it("rejects an empty name without persisting", async () => {
    const testDb = createTestDb();
    await new InstitutionRepository(testDb.db).create({ id: "inst-1", name: "Bank One" });
    const accounts = new AccountRepository(testDb.db);
    await accounts.create({
      id: "acc-1",
      institutionId: "inst-1",
      name: "Savings",
      accountNumber: null,
      currencyCode: "INR"
    });
    const redirectTo = vi.fn();

    const result = await updateAccount({} as EditAccountFormState, editFormData("acc-1", { name: "  " }), {
      db: testDb.db,
      redirectTo
    });

    expect(result.fieldErrors?.name).toEqual({ key: "errors.accountNameRequired" });
    expect(await accounts.getById("acc-1")).toMatchObject({ name: "Savings" });
    expect(redirectTo).not.toHaveBeenCalled();
  });

  it("updates an Account's name and account number, and redirects to its detail page", async () => {
    const testDb = createTestDb();
    await new InstitutionRepository(testDb.db).create({ id: "inst-1", name: "Bank One" });
    const accounts = new AccountRepository(testDb.db);
    await accounts.create({
      id: "acc-1",
      institutionId: "inst-1",
      name: "Savings",
      accountNumber: null,
      currencyCode: "INR"
    });
    const redirectTo = vi.fn();

    const result = await updateAccount(
      {} as EditAccountFormState,
      editFormData("acc-1", { name: "Primary Savings", accountNumber: "12345" }),
      { db: testDb.db, redirectTo }
    );

    expect(result).toEqual({});
    expect(await accounts.getById("acc-1")).toEqual({
      id: "acc-1",
      institutionId: "inst-1",
      name: "Primary Savings",
      accountNumber: "12345",
      currencyCode: "INR"
    });
    expect(redirectTo).toHaveBeenCalledWith("/accounts/acc-1?message=bank_account_updated");
  });

  it("clears an account number when submitted blank", async () => {
    const testDb = createTestDb();
    await new InstitutionRepository(testDb.db).create({ id: "inst-1", name: "Bank One" });
    const accounts = new AccountRepository(testDb.db);
    await accounts.create({
      id: "acc-1",
      institutionId: "inst-1",
      name: "Savings",
      accountNumber: "999",
      currencyCode: "INR"
    });

    const result = await updateAccount(
      {} as EditAccountFormState,
      editFormData("acc-1", { accountNumber: "" }),
      { db: testDb.db, redirectTo: vi.fn() }
    );

    expect(result).toEqual({});
    expect(await accounts.getById("acc-1")).toMatchObject({ accountNumber: null });
  });

  it("updates the Postgres repository, scoped to the owner, when an owner is resolved", async () => {
    const ownerId = randomUUID();
    const institution = { id: randomUUID(), name: "Cloud Bank" };
    await new PgInstitutionRepository(TEST_DATABASE_URL, ownerId).create(institution);
    const id = randomUUID();
    const pgAccounts = new PgAccountRepository(TEST_DATABASE_URL, ownerId);
    await pgAccounts.create({
      id,
      institutionId: institution.id,
      name: "Checking",
      accountNumber: null,
      currencyCode: "USD"
    });
    const redirectTo = vi.fn();

    try {
      const result = await updateAccount(
        {} as EditAccountFormState,
        editFormData(id, { name: "Renamed Checking" }),
        {
          getCurrentOwnerId: async () => ownerId,
          isCloudMode: () => true,
          postgresConnectionString: TEST_DATABASE_URL,
          redirectTo
        }
      );

      expect(result).toEqual({});
      expect(await pgAccounts.getById(id)).toMatchObject({ name: "Renamed Checking" });
      expect(redirectTo).toHaveBeenCalledWith(`/accounts/${id}?message=bank_account_updated`);
    } finally {
      const admin = postgres(TEST_DATABASE_URL, { max: 1 });
      await admin`delete from accounts where id = ${id}`;
      await admin`delete from institutions where id = ${institution.id}`;
      await admin.end();
    }
  });
});
