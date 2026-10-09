import { randomUUID } from "node:crypto";

import postgres from "postgres";
import { describe, expect, it, vi } from "vitest";

import { createInstitution, type InstitutionFormState } from "@/app/institutions/new/actions";
import { TEXT_FIELD_MAX_LENGTH } from "@/app/form-limits";
import { PgInstitutionRepository } from "@/db/postgres/repositories/institution-repository";
import { InstitutionRepository } from "@/db/repositories/institution-repository";
import { createTestDb } from "@/db/repositories/test-db";

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

function formDataWithName(name: string): FormData {
  const formData = new FormData();
  formData.set("name", name);
  return formData;
}

describe("createInstitution", () => {
  it("rejects an empty name before any repository call", async () => {
    const testDb = createTestDb();
    const institutions = new InstitutionRepository(testDb.db);
    const redirectTo = vi.fn();

    const result = await createInstitution({} as InstitutionFormState, formDataWithName("   "), {
      db: testDb.db,
      getCurrentOwnerId: async () => null,
      isCloudMode: () => false,
      redirectTo,
      newId: () => "inst-should-not-exist"
    });

    expect(result).toMatchObject({
      fieldErrors: { name: { key: "errors.nameRequired" } },
      values: { name: "   " }
    });
    expect(result.formKey).toBeTruthy();
    expect(await institutions.listAll()).toEqual([]);
    expect(redirectTo).not.toHaveBeenCalled();
  });

  it("rejects a name longer than TEXT_FIELD_MAX_LENGTH", async () => {
    const testDb = createTestDb();
    const institutions = new InstitutionRepository(testDb.db);
    const redirectTo = vi.fn();
    const tooLong = "a".repeat(TEXT_FIELD_MAX_LENGTH + 1);

    const result = await createInstitution({} as InstitutionFormState, formDataWithName(tooLong), {
      db: testDb.db,
      getCurrentOwnerId: async () => null,
      isCloudMode: () => false,
      redirectTo,
      newId: () => "inst-should-not-exist"
    });

    expect(result).toMatchObject({
      fieldErrors: {
        name: { key: "errors.textTooLong", params: { max: TEXT_FIELD_MAX_LENGTH } }
      }
    });
    expect(await institutions.listAll()).toEqual([]);
    expect(redirectTo).not.toHaveBeenCalled();
  });

  it("persists a valid Institution retrievable via getById", async () => {
    const testDb = createTestDb();
    const institutions = new InstitutionRepository(testDb.db);
    const redirectTo = vi.fn();

    const result = await createInstitution({} as InstitutionFormState, formDataWithName("DBS Bank"), {
      db: testDb.db,
      getCurrentOwnerId: async () => null,
      isCloudMode: () => false,
      redirectTo,
      newId: () => "inst-1"
    });

    expect(result).toEqual({});
    expect(await institutions.getById("inst-1")).toEqual({
      id: "inst-1",
      name: "DBS Bank"
    });
    expect(redirectTo).toHaveBeenCalledWith("/institutions/inst-1?message=institution_created");
  });

  it("persists to the Postgres repository, scoped to the owner, when an owner is resolved", async () => {
    const ownerId = randomUUID();
    const id = randomUUID();
    const redirectTo = vi.fn();

    try {
      const result = await createInstitution({} as InstitutionFormState, formDataWithName("Cloud Bank"), {
        getCurrentOwnerId: async () => ownerId,
        isCloudMode: () => true,
        postgresConnectionString: TEST_DATABASE_URL,
        redirectTo,
        newId: () => id
      });

      expect(result).toEqual({});
      const pgInstitutions = new PgInstitutionRepository(TEST_DATABASE_URL, ownerId);
      expect(await pgInstitutions.listAll()).toEqual([{ id, name: "Cloud Bank" }]);
      expect(redirectTo).toHaveBeenCalledWith(`/institutions/${id}?message=institution_created`);
    } finally {
      const admin = postgres(TEST_DATABASE_URL, { max: 1 });
      await admin`delete from institutions where id = ${id}`;
      await admin.end();
    }
  });
});
