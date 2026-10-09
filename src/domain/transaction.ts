import type { TransactionCategory } from "@/domain/transaction-category";

export type TrustStatus = "Confirmed" | "Imported";

export type Transaction = {
  id: string;
  accountId: string;
  amountMinor: number;
  occurredAt: string;
  description: string;
  trustStatus: TrustStatus;
  transferId: string | null;
  category: TransactionCategory | null;
  importBatchId: string | null;
  // The statement's own reference/confirmation number, when supplied — used for Suspected
  // Duplicate matching (CONTEXT.md). Optional for the same reason as the field below: most
  // Transaction-creating call sites have no such number.
  externalRef?: string | null;
  // Suspected Duplicate (CONTEXT.md) — set only by ImportBatchRepository.create() at commit time.
  // Optional (unlike the other fields above) so the many unrelated call sites that construct a
  // Transaction (manual entry, Transfer/FixedDeposit/Adjustment legs) don't need to know about it;
  // a row read back from the database always carries a real value, never undefined.
  possibleDuplicateOfTransactionId?: string | null;
};

export class InvalidTransactionTimestampError extends Error {
  constructor() {
    super("Transaction timestamp must be a valid ISO 8601 timestamp.");
    this.name = "InvalidTransactionTimestampError";
  }
}

export function normalizeTransactionTimestamp(timestamp: string): string {
  const date = new Date(timestamp);

  if (Number.isNaN(date.getTime())) {
    throw new InvalidTransactionTimestampError();
  }

  return date.toISOString();
}
