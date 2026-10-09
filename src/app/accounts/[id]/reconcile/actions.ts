"use server";

import { redirect } from "next/navigation";

import { withPersistedFormState } from "@/app/form-persistence";
import { DatabaseConstraintError } from "@/db/errors";
import {
  getAccountRepository,
  getBalanceSnapshotRepository,
  getReconciliationRepository,
  type RepositoryFactoryDeps
} from "@/db/repository-factory";
import { assertValidCalendarDate, InvalidCalendarDateError } from "@/domain/calendar-date";
import { parseDecimalToMinorUnits } from "@/domain/decimal-input";
import { InvalidMinorUnitsError } from "@/domain/money";
import type { LocalizedText } from "@/i18n/translator";

export type ReconciliationFormState = {
  fieldErrors?: {
    balance?: LocalizedText;
    asOfDate?: LocalizedText;
  };
  formError?: LocalizedText;
  values?: Record<string, string>;
  formKey?: string;
};

export type ReconcileAccountDeps = RepositoryFactoryDeps & {
  redirectTo?: (path: string) => void;
  newId?: () => string;
  now?: () => string;
};

export async function reconcileAccount(
  _prevState: ReconciliationFormState,
  formData: FormData,
  deps: ReconcileAccountDeps = {}
): Promise<ReconciliationFormState> {
  const fail = (state: Omit<ReconciliationFormState, "values" | "formKey">) =>
    withPersistedFormState(formData, state);

  const accountId = String(formData.get("accountId") ?? "");
  const accounts = await getAccountRepository(deps);
  const account = await accounts.getById(accountId);

  if (!account) {
    return fail({ formError: { key: "errors.accountMissing" } });
  }

  let balanceMinor: number;
  try {
    balanceMinor = parseDecimalToMinorUnits(
      String(formData.get("balance") ?? ""),
      account.currencyCode
    );
  } catch (error) {
    if (error instanceof InvalidMinorUnitsError) {
      return fail({ fieldErrors: { balance: { key: "errors.reportedBalanceInvalid" } } });
    }
    throw error;
  }

  const asOfDate = String(formData.get("asOfDate") ?? "");
  try {
    assertValidCalendarDate(asOfDate);
  } catch (error) {
    if (error instanceof InvalidCalendarDateError) {
      return fail({ fieldErrors: { asOfDate: { key: "errors.asOfDateInvalid" } } });
    }
    throw error;
  }

  const newId = deps.newId ?? (() => crypto.randomUUID());
  const snapshotId = newId();
  const reconciliationId = newId();

  try {
    await (await getBalanceSnapshotRepository(deps)).create({
      id: snapshotId,
      accountId,
      asOfDate,
      balanceMinor
    });
    await (await getReconciliationRepository(deps)).create({
      id: reconciliationId,
      accountId,
      balanceSnapshotId: snapshotId,
      reconciledAt: (deps.now ?? (() => new Date().toISOString()))()
    });
  } catch (error) {
    if (error instanceof DatabaseConstraintError) {
      return fail({ formError: { key: "errors.reconciliationNotSaved" } });
    }
    throw error;
  }

  (deps.redirectTo ?? redirect)(`/reconciliations/${reconciliationId}`);
  return {};
}
