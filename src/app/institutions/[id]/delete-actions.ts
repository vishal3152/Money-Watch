"use server";

import { redirect } from "next/navigation";

import { EntityHasDependentsError } from "@/db/errors";
import { getInstitutionRepository, type RepositoryFactoryDeps } from "@/db/repository-factory";
import type { DeleteFormState } from "@/app/components/delete-confirm-form";
import { domainErrorText } from "@/app/domain-error-text";

export type DeleteInstitutionDeps = RepositoryFactoryDeps & {
  redirectTo?: (path: string) => void;
};

export async function deleteInstitution(
  _prevState: DeleteFormState,
  formData: FormData,
  deps: DeleteInstitutionDeps = {}
): Promise<DeleteFormState> {
  const institutionId = String(formData.get("institutionId") ?? "");
  const institutions = await getInstitutionRepository(deps);

  try {
    await institutions.delete(institutionId);
  } catch (error) {
    if (error instanceof EntityHasDependentsError) {
      return { formError: domainErrorText(error) };
    }
    throw error;
  }

  (deps.redirectTo ?? redirect)("/?message=institution_deleted");
  return {};
}
