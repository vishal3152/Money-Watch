"use server";

import { redirect } from "next/navigation";

import { textFieldLengthError } from "@/app/form-limits";
import { withPersistedFormState, type FormPersistence } from "@/app/form-persistence";
import { type RepositoryFactoryDeps } from "@/db/repository-factory";
import { InvalidEmailAlertError, validateImportableEmailAlert } from "@/domain/email-alert";
import { InvalidMinorUnitsError } from "@/domain/money";
import {
  EmailAlertNotResolvableError,
  resolveUnresolvedEmailAlert
} from "@/email-sync/resolve-unresolved-email-alert";
import type { LocalizedText } from "@/i18n/translator";

export type ResolveUnresolvedEmailAlertState = Partial<FormPersistence> & {
  formError?: LocalizedText;
  fieldErrors?: Record<string, LocalizedText>;
};

export type ResolveUnresolvedEmailAlertDeps = RepositoryFactoryDeps & {
  redirectTo?: (path: string) => void;
};

/** What the owner has to fix, per field, when their corrected value still doesn't validate. */
const FIELD_ERRORS: Record<string, LocalizedText> = {
  direction: { key: "errors.alertDirection" },
  amount: { key: "errors.alertAmount" },
  currencyCode: { key: "errors.alertCurrency" },
  occurredAt: { key: "errors.alertDate" },
  description: { key: "errors.alertDescription" },
  payload: { key: "errors.alertPayload" }
};

/** Maps a failure raised while creating the ImportBatch onto the field the owner can act on. */
function fieldErrorForImportFailure(error: unknown): Record<string, LocalizedText> | null {
  if (error instanceof InvalidEmailAlertError) {
    if (error.reason === "currencyCode") {
      return { currencyCode: { key: "errors.alertCurrencyMismatch" } };
    }
    if (error.reason === "accountId") {
      return { accountId: { key: "errors.alertAccountRequired" } };
    }
    return {
      [error.reason]: FIELD_ERRORS[error.reason] ?? { key: "errors.alertValueInvalid" }
    };
  }
  if (error instanceof InvalidMinorUnitsError) {
    return { amount: { key: "errors.alertMinorUnits" } };
  }
  return null;
}

export async function resolveUnresolvedEmailAlertAction(
  _prevState: ResolveUnresolvedEmailAlertState,
  formData: FormData,
  deps: ResolveUnresolvedEmailAlertDeps = {}
): Promise<ResolveUnresolvedEmailAlertState> {
  const alertId = String(formData.get("alertId") ?? "").trim();
  const accountId = String(formData.get("accountId") ?? "").trim();
  const corrections = {
    direction: String(formData.get("direction") ?? "").trim(),
    amount: String(formData.get("amount") ?? "").trim(),
    currencyCode: String(formData.get("currencyCode") ?? "").trim(),
    occurredAt: String(formData.get("occurredAt") ?? "").trim(),
    description: String(formData.get("description") ?? "").trim()
  };

  const fieldErrors: Record<string, LocalizedText> = {};
  if (!accountId) {
    fieldErrors.accountId = { key: "errors.alertAccountRequired" };
  }
  const descriptionLengthError = textFieldLengthError(corrections.description);
  if (descriptionLengthError) {
    fieldErrors.description = descriptionLengthError;
  }

  const validation = validateImportableEmailAlert(corrections);
  if (!validation.valid) {
    for (const field of validation.invalidFields) {
      fieldErrors[field] ??= FIELD_ERRORS[field] ?? { key: "errors.alertValueInvalid" };
    }
  }

  if (!validation.valid || Object.keys(fieldErrors).length > 0) {
    return withPersistedFormState(formData, { fieldErrors });
  }

  try {
    const batch = await resolveUnresolvedEmailAlert({ alertId, accountId, alert: validation.alert }, deps);
    (deps.redirectTo ?? redirect)(`/imports/${batch.id}`);
    return {};
  } catch (error) {
    if (error instanceof EmailAlertNotResolvableError) {
      return withPersistedFormState(formData, {
        formError: { key: "errors.alertGone" }
      });
    }
    const importFieldErrors = fieldErrorForImportFailure(error);
    if (importFieldErrors) {
      return withPersistedFormState(formData, { fieldErrors: importFieldErrors });
    }
    throw error;
  }
}
