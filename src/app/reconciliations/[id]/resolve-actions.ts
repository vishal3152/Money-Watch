"use server";

import { revalidatePath } from "next/cache";

import { withPersistedFormState } from "@/app/form-persistence";
import { textFieldLengthError } from "@/app/form-limits";
import { DiscrepancyAlreadyResolvedError } from "@/db/errors";
import {
  getAccountRepository,
  getReconciliationRepository,
  type RepositoryFactoryDeps
} from "@/db/repository-factory";
import { parseDecimalToMinorUnits } from "@/domain/decimal-input";
import { InvalidMinorUnitsError } from "@/domain/money";
import type { LocalizedText } from "@/i18n/translator";

export type ResolveDiscrepancyFormState = {
  fieldErrors?: {
    amount?: LocalizedText;
    description?: LocalizedText;
  };
  formError?: LocalizedText;
  success?: boolean;
  values?: Record<string, string>;
  formKey?: string;
};

export type ResolveDiscrepancyDeps = RepositoryFactoryDeps & {
  refresh?: (path: string) => void;
  newId?: () => string;
  now?: () => string;
};

export async function resolveDiscrepancy(
  _prevState: ResolveDiscrepancyFormState,
  formData: FormData,
  deps: ResolveDiscrepancyDeps = {}
): Promise<ResolveDiscrepancyFormState> {
  const fail = (state: Omit<ResolveDiscrepancyFormState, "values" | "formKey">) =>
    withPersistedFormState(formData, state);

  const reconciliationId = String(formData.get("reconciliationId") ?? "");
  const discrepancyId = String(formData.get("discrepancyId") ?? "");
  const resolution = String(formData.get("resolution") ?? "");
  const reconciliations = await getReconciliationRepository(deps);
  const discrepancy = await reconciliations.getDiscrepancyByReconciliationId(reconciliationId);

  if (!discrepancy || discrepancy.id !== discrepancyId) {
    return fail({ formError: { key: "errors.discrepancyMissing" } });
  }

  if (discrepancy.resolution !== null) {
    return fail({ formError: { key: "errors.discrepancyAlreadyResolved" } });
  }

  if (resolution === "disputed-with-bank") {
    try {
      await reconciliations.resolveDiscrepancy(discrepancyId, "disputed-with-bank");
    } catch (error) {
      if (error instanceof DiscrepancyAlreadyResolvedError) {
        return fail({ formError: { key: "errors.discrepancyAlreadyResolved" } });
      }
      throw error;
    }
    (deps.refresh ?? revalidatePath)(`/reconciliations/${reconciliationId}`);
    return { success: true };
  }

  if (resolution !== "corrected-my-record") {
    return fail({ formError: { key: "errors.resolutionRequired" } });
  }

  const amount = String(formData.get("amount") ?? "");
  const description = String(formData.get("description") ?? "").trim();
  if (amount.length === 0 || description.length === 0) {
    return fail({ formError: { key: "errors.adjustmentFieldsRequired" } });
  }
  const descriptionLengthError = textFieldLengthError(description);
  if (descriptionLengthError) {
    return fail({ fieldErrors: { description: descriptionLengthError } });
  }

  const reconciliation = await reconciliations.getById(reconciliationId);
  const account = reconciliation
    ? await (await getAccountRepository(deps)).getById(reconciliation.accountId)
    : null;
  if (!reconciliation || !account) {
    return fail({ formError: { key: "errors.reconciliationAccountMissing" } });
  }

  let amountMinor: number;
  try {
    amountMinor = parseDecimalToMinorUnits(amount, account.currencyCode);
  } catch (error) {
    if (error instanceof InvalidMinorUnitsError) {
      return fail({ fieldErrors: { amount: { key: "errors.adjustmentAmountInvalid" } } });
    }
    throw error;
  }

  try {
    await reconciliations.resolveWithAdjustment(discrepancyId, {
      id: (deps.newId ?? (() => crypto.randomUUID()))(),
      accountId: account.id,
      amountMinor,
      occurredAt: (deps.now ?? (() => new Date().toISOString()))(),
      description
    });
  } catch (error) {
    if (error instanceof DiscrepancyAlreadyResolvedError) {
      return fail({ formError: { key: "errors.discrepancyAlreadyResolved" } });
    }
    throw error;
  }
  (deps.refresh ?? revalidatePath)(`/reconciliations/${reconciliationId}`);
  return { success: true };
}
