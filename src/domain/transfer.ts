import { getMinorUnitExponent } from "@/domain/currency";

export type Transfer = {
  id: string;
  sourceAccountId: string | null;
  sourceFixedDepositId: string | null;
  sourceAmountMinor: number;
  sourceCurrencyCode: string;
  destinationAccountId: string | null;
  destinationFixedDepositId: string | null;
  destinationAmountMinor: number;
  destinationCurrencyCode: string;
  occurredAt: string;
  description: string;
  purpose: TransferPurpose;
};

export type TransferPurpose =
  | "general"
  | "fixed-deposit-opening"
  | "fixed-deposit-top-up"
  | "fixed-deposit-withdrawal";

export class InvalidTransferLegsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidTransferLegsError";
  }
}

export class InvalidTransferPurposeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidTransferPurposeError";
  }
}

export class InvalidTransferAmountsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidTransferAmountsError";
  }
}

function assertExactlyOneLeg(accountId: string | null, fixedDepositId: string | null, side: "source" | "destination") {
  const legCount = [accountId, fixedDepositId].filter((id) => id !== null).length;

  if (legCount !== 1) {
    throw new InvalidTransferLegsError(
      `Transfer ${side} must reference exactly one of an Account or Fixed Deposit.`
    );
  }
}

export function assertValidTransferLegs(transfer: Transfer): void {
  assertExactlyOneLeg(transfer.sourceAccountId, transfer.sourceFixedDepositId, "source");
  assertExactlyOneLeg(transfer.destinationAccountId, transfer.destinationFixedDepositId, "destination");

  if (
    (transfer.sourceAccountId !== null && transfer.sourceAccountId === transfer.destinationAccountId) ||
    (transfer.sourceFixedDepositId !== null &&
      transfer.sourceFixedDepositId === transfer.destinationFixedDepositId)
  ) {
    throw new InvalidTransferLegsError("Transfer source and destination must not be the same.");
  }
}

export function assertValidTransferPurpose(transfer: Transfer): void {
  const hasSourceFixedDeposit = transfer.sourceFixedDepositId !== null;
  const hasDestinationFixedDeposit = transfer.destinationFixedDepositId !== null;

  if (!hasSourceFixedDeposit && !hasDestinationFixedDeposit) {
    if (transfer.purpose !== "general") {
      throw new InvalidTransferPurposeError("Account-to-Account Transfers must use purpose general.");
    }
    return;
  }

  if (hasDestinationFixedDeposit) {
    if (transfer.sourceAccountId === null || transfer.destinationAccountId !== null) {
      throw new InvalidTransferPurposeError(
        "A Fixed Deposit destination requires an Account source and no Account destination."
      );
    }
    if (transfer.purpose !== "fixed-deposit-opening" && transfer.purpose !== "fixed-deposit-top-up") {
      throw new InvalidTransferPurposeError(
        "A Transfer into a Fixed Deposit must be fixed-deposit-opening or fixed-deposit-top-up."
      );
    }
    return;
  }

  if (transfer.destinationAccountId === null || transfer.sourceAccountId !== null) {
    throw new InvalidTransferPurposeError(
      "A Fixed Deposit withdrawal requires a Fixed Deposit source and an Account destination."
    );
  }
  if (transfer.purpose !== "fixed-deposit-withdrawal") {
    throw new InvalidTransferPurposeError(
      "A Transfer out of a Fixed Deposit must be fixed-deposit-withdrawal."
    );
  }
}

export function assertValidTransferAmounts(transfer: Transfer): void {
  if (transfer.sourceAmountMinor <= 0 || transfer.destinationAmountMinor <= 0) {
    throw new InvalidTransferAmountsError("Transfer amounts must be greater than zero.");
  }

  if (
    transfer.sourceCurrencyCode === transfer.destinationCurrencyCode &&
    transfer.sourceAmountMinor !== transfer.destinationAmountMinor
  ) {
    throw new InvalidTransferAmountsError(
      "Same-currency Transfer amounts must match on both legs."
    );
  }
}

export function realizedFxRate(transfer: Transfer): number {
  const sourceUnits = transfer.sourceAmountMinor / 10 ** getMinorUnitExponent(transfer.sourceCurrencyCode);
  const destinationUnits =
    transfer.destinationAmountMinor / 10 ** getMinorUnitExponent(transfer.destinationCurrencyCode);

  return destinationUnits / sourceUnits;
}
