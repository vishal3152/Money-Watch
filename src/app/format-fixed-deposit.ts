import { formatMinorUnits } from "@/app/format-money";
import type { FixedDeposit } from "@/domain/fixed-deposit";
import type { TransferPurpose } from "@/domain/transfer";
import type { Translator } from "@/i18n/translator";

export function formatFixedDepositSubtitle(
  fixedDeposit: Pick<FixedDeposit, "status" | "maturityDate">,
  t: Translator["t"]
): string {
  return t("fixedDeposits.subtitle", {
    status: t(`fixedDepositStatus.${fixedDeposit.status}`),
    date: fixedDeposit.maturityDate
  });
}

export function formatFixedDepositLabel(
  fixedDeposit: Pick<
    FixedDeposit,
    "name" | "principalMinor" | "currencyCode" | "maturityDate" | "status"
  >,
  t: Translator["t"]
): string {
  return t("fixedDeposits.label", {
    name: fixedDeposit.name,
    amount: formatMinorUnits(fixedDeposit.principalMinor, fixedDeposit.currencyCode),
    subtitle: formatFixedDepositSubtitle(fixedDeposit, t)
  });
}

export function formatTransferPurpose(purpose: TransferPurpose, t: Translator["t"]): string {
  return t(`transferPurpose.${purpose}`);
}
