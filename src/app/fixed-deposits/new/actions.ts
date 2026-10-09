"use server";

import { redirect } from "next/navigation";

import { claimIdempotencyKey } from "@/app/duplicate-submission-guard";
import { textFieldLengthError } from "@/app/form-limits";
import { withPersistedFormState } from "@/app/form-persistence";
import {
  DatabaseConstraintError,
  FixedDepositInstitutionMismatchError
} from "@/db/errors";
import {
  getAccountRepository,
  getFixedDepositRepository,
  type RepositoryFactoryDeps
} from "@/db/repository-factory";
import { assertValidCalendarDate, InvalidCalendarDateError } from "@/domain/calendar-date";
import { parseDecimalToMinorUnits, parsePercentageToBps } from "@/domain/decimal-input";
import { InvalidMinorUnitsError } from "@/domain/money";
import type { LocalizedText } from "@/i18n/translator";

const OPENING_DEBIT_DESCRIPTION = "Opening deposit";

export type FixedDepositFormState = {
  fieldErrors?: {
    name?: LocalizedText;
    accountNumber?: LocalizedText;
    principal?: LocalizedText;
    interestRate?: LocalizedText;
    openedDate?: LocalizedText;
    maturityDate?: LocalizedText;
    linkedAccountId?: LocalizedText;
  };
  formError?: LocalizedText;
  values?: Record<string, string>;
  formKey?: string;
};

export type CreateFixedDepositDeps = RepositoryFactoryDeps & {
  redirectTo?: (path: string) => void;
  newId?: () => string;
};

function optionalAccountNumber(value: FormDataEntryValue | null): string | null {
  const trimmed = String(value ?? "").trim();
  return trimmed.length === 0 ? null : trimmed;
}

export async function createFixedDeposit(
  _prevState: FixedDepositFormState,
  formData: FormData,
  deps: CreateFixedDepositDeps = {}
): Promise<FixedDepositFormState> {
  const fail = (state: Omit<FixedDepositFormState, "values" | "formKey">) =>
    withPersistedFormState(formData, state);

  const institutionId = String(formData.get("institutionId") ?? "");
  const linkedAccountId = String(formData.get("linkedAccountId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const accountNumber = optionalAccountNumber(formData.get("accountNumber"));
  const accounts = await getAccountRepository(deps);

  if (name.length === 0) {
    return fail({ fieldErrors: { name: { key: "errors.nameRequired" } } });
  }
  const nameLengthError = textFieldLengthError(name);
  if (nameLengthError) {
    return fail({ fieldErrors: { name: nameLengthError } });
  }
  if (accountNumber !== null) {
    const accountNumberLengthError = textFieldLengthError(accountNumber);
    if (accountNumberLengthError) {
      return fail({ fieldErrors: { accountNumber: accountNumberLengthError } });
    }
  }

  const linkedAccount = await accounts.getById(linkedAccountId);
  if (!linkedAccount) {
    return fail({ formError: { key: "errors.fixedDepositLinkMissing" } });
  }
  if (linkedAccount.institutionId !== institutionId) {
    return fail({
      fieldErrors: {
        linkedAccountId: { key: "errors.linkedAccountInstitutionMismatch" }
      }
    });
  }
  const currencyCode = linkedAccount.currencyCode;

  let principalMinor: number;
  try {
    principalMinor = parseDecimalToMinorUnits(String(formData.get("principal") ?? ""), currencyCode);
  } catch (error) {
    if (error instanceof InvalidMinorUnitsError) {
      return fail({ fieldErrors: { principal: { key: "errors.principalInvalid" } } });
    }
    throw error;
  }
  if (principalMinor <= 0) {
    return fail({ fieldErrors: { principal: { key: "errors.principalNotPositive" } } });
  }

  let interestRateBps: number;
  try {
    interestRateBps = parsePercentageToBps(String(formData.get("interestRate") ?? ""));
  } catch (error) {
    if (error instanceof InvalidMinorUnitsError) {
      return fail({ fieldErrors: { interestRate: { key: "errors.interestRateInvalid" } } });
    }
    throw error;
  }

  const openedDate = String(formData.get("openedDate") ?? "");
  try {
    assertValidCalendarDate(openedDate);
  } catch (error) {
    if (error instanceof InvalidCalendarDateError) {
      return fail({ fieldErrors: { openedDate: { key: "errors.openedDateInvalid" } } });
    }
    throw error;
  }

  const maturityDate = String(formData.get("maturityDate") ?? "");
  try {
    assertValidCalendarDate(maturityDate);
  } catch (error) {
    if (error instanceof InvalidCalendarDateError) {
      return fail({ fieldErrors: { maturityDate: { key: "errors.maturityDateInvalid" } } });
    }
    throw error;
  }

  if (maturityDate <= openedDate) {
    return fail({ fieldErrors: { maturityDate: { key: "errors.maturityBeforeOpening" } } });
  }

  const idempotencyKey = String(formData.get("idempotencyKey") ?? "");
  if (!claimIdempotencyKey(idempotencyKey)) {
    return fail({
      formError: { key: "errors.fixedDepositDuplicateSubmission" }
    });
  }

  const newId = deps.newId ?? (() => crypto.randomUUID());
  const id = newId();
  const debitNow = formData.get("debitNow") === "on";

  try {
    await (await getFixedDepositRepository(deps)).create(
      {
        id,
        name,
        accountNumber,
        institutionId,
        linkedAccountId,
        principalMinor,
        originalPrincipalMinor: principalMinor,
        currencyCode,
        interestRateBps,
        openedDate,
        maturityDate,
        status: "Open"
      },
      debitNow
        ? {
            transferId: newId(),
            transactionId: newId(),
            description: OPENING_DEBIT_DESCRIPTION
          }
        : undefined
    );
  } catch (error) {
    if (error instanceof FixedDepositInstitutionMismatchError) {
      return fail({
        fieldErrors: {
          linkedAccountId: { key: "errors.linkedAccountInstitutionMismatch" }
        }
      });
    }
    if (error instanceof DatabaseConstraintError) {
      return fail({ formError: { key: "errors.fixedDepositLinkMissing" } });
    }
    if (error instanceof InvalidMinorUnitsError) {
      return fail({ fieldErrors: { principal: { key: "errors.principalNotPositive" } } });
    }
    throw error;
  }

  (deps.redirectTo ?? redirect)(`/fixed-deposits/${id}?message=fixed_deposit_created`);
  return {};
}
