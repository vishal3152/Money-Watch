import { randomUUID } from "node:crypto";

import postgres from "postgres";
import { describe, expect, it, vi } from "vitest";

import { updateInstitution, type EditInstitutionFormState } from "@/app/institutions/[id]/edit/actions";
import { PgInstitutionRepository } from "@/db/postgres/repositories/institution-repository";
import { InstitutionRepository } from "@/db/repositories/institution-repository";
import { createTestDb } from "@/db/repositories/test-db";

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

function editFormData(institutionId: string, name: string): FormData {
  const formData = new FormData();
  formData.set("institutionId", institutionId);
  formData.set("name", name);
  return formData;
}

describe("updateInstitution", () => {
  it("rejects an empty name without persisting", async () => {
    const testDb = createTestDb();
    const institutions = new InstitutionRepository(testDb.db);
    await institutions.create({ id: "inst-1", name: "Bank One" });
    const redirectTo = vi.fn();

    const result = await updateInstitution(
      {} as EditInstitutionFormState,
      editFormData("inst-1", "   "),
      { db: testDb.db, redirectTo }
    );

    expect(result.fieldErrors?.name).toEqual({ key: "errors.nameRequired" });
    expect(await institutions.getById("inst-1")).toEqual({ id: "inst-1", name: "Bank One" });
    expect(redirectTo).not.toHaveBeenCalled();
  });

  it("renames an Institution and redirects to its detail page", async () => {
    const testDb = createTestDb();
    const institutions = new InstitutionRepository(testDb.db);
    await institutions.create({ id: "inst-1", name: "Bank One" });
    const redirectTo = vi.fn();

    const result = await updateInstitution(
      {} as EditInstitutionFormState,
      editFormData("inst-1", "Renamed Bank"),
      { db: testDb.db, redirectTo }
    );

    expect(result).toEqual({});
    expect(await institutions.getById("inst-1")).toEqual({ id: "inst-1", name: "Renamed Bank" });
    expect(redirectTo).toHaveBeenCalledWith("/institutions/inst-1?message=institution_updated");
  });

  it("updates the Postgres repository, scoped to the owner, when an owner is resolved", async () => {
    const ownerId = randomUUID();
    const id = randomUUID();
    const redirectTo = vi.fn();
    const pgInstitutions = new PgInstitutionRepository(TEST_DATABASE_URL, ownerId);
    await pgInstitutions.create({ id, name: "Cloud Bank" });

    try {
      const result = await updateInstitution({} as EditInstitutionFormState, editFormData(id, "Cloud Bank Renamed"), {
        getCurrentOwnerId: async () => ownerId,
        isCloudMode: () => true,
        postgresConnectionString: TEST_DATABASE_URL,
        redirectTo
      });

      expect(result).toEqual({});
      expect(await pgInstitutions.getById(id)).toEqual({ id, name: "Cloud Bank Renamed" });
      expect(redirectTo).toHaveBeenCalledWith(`/institutions/${id}?message=institution_updated`);
    } finally {
      const admin = postgres(TEST_DATABASE_URL, { max: 1 });
      await admin`delete from institutions where id = ${id}`;
      await admin.end();
    }
  });
});
