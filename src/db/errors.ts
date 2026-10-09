export class DatabaseError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "DatabaseError";
  }
}

export class DatabaseConfigurationError extends DatabaseError {
  constructor(message: string) {
    super(message);
    this.name = "DatabaseConfigurationError";
  }
}

export class DatabaseConstraintError extends DatabaseError {
  constructor(cause: unknown) {
    super("Database constraint rejected the operation.", { cause });
    this.name = "DatabaseConstraintError";
  }
}

export class BalanceSnapshotNotFoundError extends DatabaseError {
  constructor(balanceSnapshotId: string) {
    super(`Balance snapshot ${balanceSnapshotId} not found.`);
    this.name = "BalanceSnapshotNotFoundError";
  }
}

export class DiscrepancyNotFoundError extends DatabaseError {
  constructor(discrepancyId: string) {
    super(`Discrepancy ${discrepancyId} not found.`);
    this.name = "DiscrepancyNotFoundError";
  }
}

export class DiscrepancyAlreadyResolvedError extends DatabaseError {
  constructor() {
    super("This Discrepancy has already been resolved.");
    this.name = "DiscrepancyAlreadyResolvedError";
  }
}

export class FixedDepositTransferError extends DatabaseError {
  constructor(message: string) {
    super(message);
    this.name = "FixedDepositTransferError";
  }
}

export class TransferCurrencyMismatchError extends DatabaseError {
  constructor(message: string) {
    super(message);
    this.name = "TransferCurrencyMismatchError";
  }
}

export class TransferNotFoundError extends DatabaseError {
  constructor(transferId: string) {
    super(`Transfer ${transferId} not found.`);
    this.name = "TransferNotFoundError";
  }
}

export class TransferNotEditableError extends DatabaseError {
  constructor() {
    super(
      "An opening Transfer can't be edited — its amount is fixed to the Fixed Deposit's original principal."
    );
    this.name = "TransferNotEditableError";
  }
}

export class FixedDepositCurrencyMismatchError extends DatabaseError {
  constructor(message: string) {
    super(message);
    this.name = "FixedDepositCurrencyMismatchError";
  }
}

export class FixedDepositInstitutionMismatchError extends DatabaseError {
  constructor(message: string) {
    super(message);
    this.name = "FixedDepositInstitutionMismatchError";
  }
}

export class EntityHasDependentsError extends DatabaseError {
  constructor(message: string) {
    super(message);
    this.name = "EntityHasDependentsError";
  }
}

export class AccountHardDeleteBlockedError extends DatabaseError {
  constructor(message: string) {
    super(message);
    this.name = "AccountHardDeleteBlockedError";
  }
}

export class InstitutionNotFoundError extends DatabaseError {
  constructor(institutionId: string) {
    super(`Institution ${institutionId} not found.`);
    this.name = "InstitutionNotFoundError";
  }
}

export class AccountNotFoundError extends DatabaseError {
  constructor(accountId: string) {
    super(`Account ${accountId} not found.`);
    this.name = "AccountNotFoundError";
  }
}

export class ShareTradingAccountNotFoundError extends DatabaseError {
  constructor(shareTradingAccountId: string) {
    super(`Share Trading Account ${shareTradingAccountId} not found.`);
    this.name = "ShareTradingAccountNotFoundError";
  }
}

export class ImportBatchNotFoundError extends DatabaseError {
  constructor(importBatchId: string) {
    super(`Import batch ${importBatchId} not found.`);
    this.name = "ImportBatchNotFoundError";
  }
}

export class ImportBatchAlreadyConfirmedError extends DatabaseError {
  constructor() {
    super("This import has already been confirmed.");
    this.name = "ImportBatchAlreadyConfirmedError";
  }
}

export class ImportBatchNotConfirmedError extends DatabaseError {
  constructor() {
    super("This import has not been confirmed yet — use the pre-confirmation delete instead.");
    this.name = "ImportBatchNotConfirmedError";
  }
}

export class ImportBatchUndoBlockedError extends DatabaseError {
  constructor(message: string) {
    super(message);
    this.name = "ImportBatchUndoBlockedError";
  }
}

export class ImportBatchHasUnresolvedDuplicatesError extends DatabaseError {
  constructor() {
    super(
      "This import has one or more Suspected Duplicate Transactions. Resolve them (dismiss or remove) before confirming."
    );
    this.name = "ImportBatchHasUnresolvedDuplicatesError";
  }
}

export class StockImportBatchNotFoundError extends DatabaseError {
  constructor(stockImportBatchId: string) {
    super(`Stock import batch ${stockImportBatchId} not found.`);
    this.name = "StockImportBatchNotFoundError";
  }
}

export class StockImportBatchAlreadyConfirmedError extends DatabaseError {
  constructor() {
    super("This stock import has already been confirmed.");
    this.name = "StockImportBatchAlreadyConfirmedError";
  }
}

export class StockImportBatchHasUnresolvedDuplicatesError extends DatabaseError {
  constructor() {
    super(
      "This stock import has one or more Suspected Duplicate StockTransactions. Resolve them (dismiss or remove) before confirming."
    );
    this.name = "StockImportBatchHasUnresolvedDuplicatesError";
  }
}

export class TransactionNotEditableError extends DatabaseError {
  constructor(reason: "transfer" | "adjustment" = "transfer") {
    super(
      reason === "transfer"
        ? "A Transfer-linked Transaction can't be edited or deleted directly — edit or delete the Transfer instead."
        : "An Adjustment Transaction can't be edited or deleted directly — it corrects a specific Discrepancy."
    );
    this.name = "TransactionNotEditableError";
  }
}

export class TransactionNotFoundError extends DatabaseError {
  constructor(transactionId: string) {
    super(`Transaction ${transactionId} not found.`);
    this.name = "TransactionNotFoundError";
  }
}

export class StockTransactionNotFoundError extends DatabaseError {
  constructor(stockTransactionId: string) {
    super(`Stock transaction ${stockTransactionId} not found.`);
    this.name = "StockTransactionNotFoundError";
  }
}

function hasSqliteConstraintCode(error: unknown): error is Error & { code: string } {
  return (
    error instanceof Error &&
    "code" in error &&
    typeof error.code === "string" &&
    error.code.startsWith("SQLITE_CONSTRAINT")
  );
}

/**
 * Walks an error's `.cause` chain looking for a Postgres error code, without requiring the error
 * to be an `instanceof` any particular driver class. Next.js's route bundling can put a repository
 * and the "postgres" package it imports into more than one webpack module instance reachable from
 * a single call graph, so `instanceof PostgresError` can silently return false for an error that
 * genuinely carries that code — observed live for a `23505` unique-violation on
 * `/api/email-sync/check-now`, which escaped as an unhandled `DrizzleQueryError` instead of being
 * converted to `DatabaseConstraintError`. Duck-typing on the code is bundle-instance-agnostic.
 */
export function hasPostgresErrorCode(error: unknown, code: string): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current !== null && typeof current === "object"; depth += 1) {
    if ("code" in current && (current as { code?: unknown }).code === code) {
      return true;
    }
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

export async function runDatabaseWrite<T>(operation: () => PromiseLike<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    // A domain error deliberately thrown inside the write (e.g. a FixedDeposit
    // invariant caught mid-transaction) is already typed and has a safe,
    // user-facing message — rethrow it as-is instead of masking it as a
    // generic "Database operation failed." that callers can no longer match
    // on `instanceof` to show a friendly error.
    if (error instanceof DatabaseError) {
      throw error;
    }

    if (hasSqliteConstraintCode(error)) {
      throw new DatabaseConstraintError(error);
    }

    throw new DatabaseError("Database operation failed.", { cause: error });
  }
}
