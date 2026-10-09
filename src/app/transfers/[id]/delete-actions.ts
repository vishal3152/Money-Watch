"use server";

import { redirect } from "next/navigation";

import { FixedDepositTransferError } from "@/db/errors";
import { getTransferRepository, type RepositoryFactoryDeps } from "@/db/repository-factory";
import type { DeleteFormState } from "@/app/components/delete-confirm-form";
import { domainErrorText } from "@/app/domain-error-text";

export type DeleteTransferDeps = RepositoryFactoryDeps & {
  redirectTo?: (path: string) => void;
};

export async function deleteTransfer(
  _prevState: DeleteFormState,
  formData: FormData,
  deps: DeleteTransferDeps = {}
): Promise<DeleteFormState> {
  const transferId = String(formData.get("transferId") ?? "");

  try {
    await (await getTransferRepository(deps)).delete(transferId);
  } catch (error) {
    if (error instanceof FixedDepositTransferError) {
      return { formError: domainErrorText(error) };
    }
    throw error;
  }

  (deps.redirectTo ?? redirect)("/?message=transfer_deleted");
  return {};
}
