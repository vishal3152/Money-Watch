export type ImportBatch = {
  id: string;
  accountId: string;
  source: string;
  createdAt: string;
  closingBalanceMinor: number | null;
  asOfDate: string | null;
  confirmedAt: string | null;
  balanceSnapshotId: string | null;
  reconciliationId: string | null;
};

export class ImportBatchClosingBalanceError extends Error {
  constructor() {
    super("A closing balance and its as-of date must be provided together, or not at all.");
    this.name = "ImportBatchClosingBalanceError";
  }
}

export function assertValidClosingBalance(closingBalance: string | null, asOfDate: string | null): void {
  if ((closingBalance === null) !== (asOfDate === null)) {
    throw new ImportBatchClosingBalanceError();
  }
}

export class ImportBatchOpeningBalanceError extends Error {
  constructor() {
    super("An opening balance and its as-of date must be provided together, or not at all.");
    this.name = "ImportBatchOpeningBalanceError";
  }
}

export function assertValidOpeningBalance(openingBalance: string | null, openingAsOfDate: string | null): void {
  if ((openingBalance === null) !== (openingAsOfDate === null)) {
    throw new ImportBatchOpeningBalanceError();
  }
}

/** Synthetic statement opening line when the Account has no prior Transactions. */
export const OPENING_BALANCE_DESCRIPTION = "Opening balance";

export class EmptyImportBatchError extends Error {
  constructor() {
    super("An import batch must contain at least one line item.");
    this.name = "EmptyImportBatchError";
  }
}
