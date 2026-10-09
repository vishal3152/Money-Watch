import { randomUUID } from "node:crypto";

import postgres from "postgres";
import { describe, expect, it, vi } from "vitest";

import { deleteInstitution } from "@/app/institutions/[id]/delete-actions";
import { PgInstitutionRepository } from "@/db/postgres/repositories/institution-repository";
import { AccountRepository } from "@/db/repositories/account-repository";
import { InstitutionRepository } from "@/db/repositories/institution-repository";
import { createTestDb } from "@/db/repositories/test-db";

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

function formDataWithInstitutionId(institutionId: string): FormData {
  const formData = new FormData();
  formData.set("institutionId", institutionId);
  return formData;
}

describe("deleteInstitution", () => {
  it("deletes a childless Institution and redirects home", async () => {
    const testDb = createTestDb();
    const institutions = new InstitutionRepository(testDb.db);
    await institutions.create({ id: "inst-1", name: "Bank One" });
    const redirectTo = vi.fn();

    const result = await deleteInstitution({}, formDataWithInstitutionId("inst-1"), {
      db: testDb.db,
      redirectTo
    });

    expect(result).toEqual({});
    expect(await institutions.getById("inst-1")).toBeNull();
    expect(redirectTo).toHaveBeenCalledWith("/?message=institution_deleted");
  });

  it("returns a form error and does not delete when the Institution still has an Account", async () => {
    const testDb = createTestDb();
    const institutions = new InstitutionRepository(testDb.db);
    await institutions.create({ id: "inst-1", name: "Bank One" });
    await new AccountRepository(testDb.db).create({
      id: "acc-1",
      institutionId: "inst-1",
      name: "Savings",
      accountNumber: null,
      currencyCode: "INR"
    });
    const redirectTo = vi.fn();

    const result = await deleteInstitution({}, formDataWithInstitutionId("inst-1"), {
      db: testDb.db,
      redirectTo
    });

    expect(result.formError).toBeDefined();
    expect(await institutions.getById("inst-1")).not.toBeNull();
    expect(redirectTo).not.toHaveBeenCalled();
  });

  it("deletes from the Postgres repository, scoped to the owner, when an owner is resolved", async () => {
    const ownerId = randomUUID();
    const id = randomUUID();
    const redirectTo = vi.fn();
    const pgInstitutions = new PgInstitutionRepository(TEST_DATABASE_URL, ownerId);
    await pgInstitutions.create({ id, name: "Cloud Bank" });

    try {
      const result = await deleteInstitution({}, formDataWithInstitutionId(id), {
        getCurrentOwnerId: async () => ownerId,
        isCloudMode: () => true,
        postgresConnectionString: TEST_DATABASE_URL,
        redirectTo
      });

      expect(result).toEqual({});
      expect(await pgInstitutions.listAll()).toEqual([]);
      expect(redirectTo).toHaveBeenCalledWith("/?message=institution_deleted");
    } finally {
      const admin = postgres(TEST_DATABASE_URL, { max: 1 });
      await admin`delete from institutions where id = ${id}`;
      await admin.end();
    }
  });
});
