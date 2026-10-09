"use server";

import { redirect } from "next/navigation";

import { withPersistedFormState } from "@/app/form-persistence";
import { textFieldLengthError } from "@/app/form-limits";
import { getInstitutionRepository, type RepositoryFactoryDeps } from "@/db/repository-factory";
import type { LocalizedText } from "@/i18n/translator";

export type InstitutionFormState = {
  fieldErrors?: {
    name?: LocalizedText;
  };
  values?: Record<string, string>;
  formKey?: string;
};

export type CreateInstitutionDeps = RepositoryFactoryDeps & {
  redirectTo?: (path: string) => void;
  newId?: () => string;
};

export async function createInstitution(
  _prevState: InstitutionFormState,
  formData: FormData,
  deps: CreateInstitutionDeps = {}
): Promise<InstitutionFormState> {
  const name = String(formData.get("name") ?? "").trim();

  if (name.length === 0) {
    return withPersistedFormState(formData, {
      fieldErrors: {
        name: { key: "errors.nameRequired" }
      }
    });
  }

  const nameLengthError = textFieldLengthError(name);
  if (nameLengthError) {
    return withPersistedFormState(formData, {
      fieldErrors: { name: nameLengthError }
    });
  }

  const institutions = await getInstitutionRepository(deps);
  const id = (deps.newId ?? (() => crypto.randomUUID()))();

  await institutions.create({ id, name });

  const redirectTo = deps.redirectTo ?? redirect;
  redirectTo(`/institutions/${id}?message=institution_created`);

  return {};
}
